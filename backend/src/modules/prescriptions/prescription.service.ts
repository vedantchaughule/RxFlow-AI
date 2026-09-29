import crypto from 'node:crypto';
import QRCode from 'qrcode';
import mongoose from 'mongoose';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { decrypt, encrypt } from '../../shared/encryption.js';
import { AppError } from '../../shared/errors.js';
import { hashIdentifier } from '../../shared/security.js';
import { recordAudit } from '../audit/audit.service.js';
import { ClinicModel } from '../clinics/clinic.model.js';
import { UserModel } from '../users/user.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { createPatientQrMaterial, renderPatientQr } from '../patients/patient-qr.service.js';
import { VisitQueueModel } from '../patients/visit-queue.model.js';
import { PrescriptionModel } from './prescription.model.js';
import { PrescriptionShareLinkModel } from './prescription-share-link.model.js';
import { createPrescriptionPdf } from './prescription-pdf.service.js';
import type { PrescriptionCreateInput, PrescriptionListQuery } from './prescription.schemas.js';
import { queueCommunicationSafely } from '../communications/communication.service.js';

function requireAuth(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.auth;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export async function finalizeManualPrescription(req: Request, input: PrescriptionCreateInput) {
  const auth = requireAuth(req);
  const session = await mongoose.startSession();
  let prescription: Record<string, unknown> | undefined;
  let qrToken = '';
  let qrIssuedAt: Date | undefined;
  const completedAt = new Date();
  try {
    await session.withTransaction(async () => {
      const queueEntry = await VisitQueueModel.findOne({ _id: input.queueEntryId, clinicId: auth.clinicId }).session(session);
      if (!queueEntry || String(queueEntry.patientId) !== input.patientId || String(queueEntry.doctorId) !== auth.userId) {
        throw new AppError(404, 'NOT_FOUND', 'Active visit not found');
      }
      if (await PrescriptionModel.exists({ clinicId: auth.clinicId, queueEntryId: queueEntry._id }).session(session)) {
        throw new AppError(409, 'PRESCRIPTION_EXISTS', 'A final prescription already exists for this visit');
      }
      if (queueEntry.status !== 'in_consultation') throw new AppError(409, 'VISIT_NOT_IN_CONSULTATION', 'Prescription can only be finalized during an active consultation');
      const patient = await PatientModel.findOne({ _id: input.patientId, clinicId: auth.clinicId, isDeleted: false })
        .select('+qrTokenEncrypted +qrTokenHash')
        .session(session);
      if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
      if (patient.qrTokenEncrypted) {
        qrToken = decrypt(patient.qrTokenEncrypted);
        qrIssuedAt = patient.qrIssuedAt ?? undefined;
      } else {
        const qrMaterial = createPatientQrMaterial();
        patient.qrTokenHash = qrMaterial.tokenHash;
        patient.qrTokenEncrypted = qrMaterial.tokenEncrypted;
        patient.qrIssuedAt = qrMaterial.issuedAt;
        await patient.save({ session });
        qrToken = qrMaterial.token;
        qrIssuedAt = qrMaterial.issuedAt;
      }
      const created = await PrescriptionModel.create([{
        clinicId: auth.clinicId,
        patientId: input.patientId,
        doctorId: auth.userId,
        queueEntryId: input.queueEntryId,
        visitDate: completedAt,
        diagnosis: input.diagnosis,
        doctorNotes: input.doctorNotes,
        medicines: input.medicines,
        source: 'manual',
        clinicianConfirmedAt: completedAt,
        deliveryStatus: 'pending',
      }], { session });
      const createdPrescription = created[0];
      if (!createdPrescription) throw new AppError(500, 'INTERNAL_ERROR', 'Unable to create prescription');
      const queueUpdate = await VisitQueueModel.updateOne(
        { _id: queueEntry._id, clinicId: auth.clinicId, status: 'in_consultation' },
        { $set: { status: 'completed', completedAt } },
        { session },
      );
      if (queueUpdate.modifiedCount !== 1) throw new AppError(409, 'CONFLICT', 'Visit was changed by another request');
      const patientUpdate = await PatientModel.updateOne(
        { _id: patient._id, clinicId: auth.clinicId, isDeleted: false },
        { $inc: { totalVisits: 1 }, $set: { lastVisitDate: completedAt } },
        { session },
      );
      if (patientUpdate.modifiedCount !== 1) throw new AppError(409, 'CONFLICT', 'Patient was changed by another request');
      prescription = createdPrescription.toObject() as unknown as Record<string, unknown>;
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, 'PRESCRIPTION_EXISTS', 'A final prescription already exists for this visit');
    throw error;
  } finally {
    await session.endSession();
  }
  if (!prescription || !qrToken) throw new AppError(500, 'INTERNAL_ERROR', 'Prescription transaction did not complete');
  const qrCode = { ...(await renderPatientQr(qrToken)), issuedAt: qrIssuedAt };
  const prescriptionId = String(prescription._id);
  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'prescription.created',
    targetType: 'Prescription',
    targetId: prescriptionId,
    metadata: { patientId: input.patientId, queueEntryId: input.queueEntryId, medicineCount: input.medicines.length, source: 'manual' },
  });
  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'queue.status_changed',
    targetType: 'VisitQueue',
    targetId: input.queueEntryId,
    metadata: { from: 'in_consultation', to: 'completed' },
  });
  const patientForMessage = await PatientModel.findOne({ _id: input.patientId, clinicId: auth.clinicId, isDeleted: false }).select('name').lean();
  const delivery: Awaited<ReturnType<typeof queueCommunicationSafely>> | { queued: false; reason: 'PATIENT_NOT_FOUND' } = patientForMessage ? await queueCommunicationSafely({ clinicId: auth.clinicId, patientId: input.patientId, purpose: 'prescription_ready', runAt: new Date(), dedupeKey: `prescription:${prescriptionId}:prescription_ready`, referenceType: 'Prescription', referenceId: prescriptionId, parameters: { patient_name: patientForMessage.name } }) : { queued: false, reason: 'PATIENT_NOT_FOUND' };
  return {
    prescription,
    qrCode,
    delivery: delivery.queued ? { status: 'queued', messageId: delivery.messageId } : { status: 'not_queued', reason: delivery.reason },
  };
}

export async function listPatientPrescriptions(req: Request, query: PrescriptionListQuery) {
  const auth = requireAuth(req);
  const patient = await PatientModel.exists({ _id: query.patientId, clinicId: auth.clinicId, isDeleted: false });
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  const filter = { clinicId: auth.clinicId, patientId: query.patientId };
  const skip = (query.page - 1) * query.limit;
  const [prescriptions, total] = await Promise.all([
    PrescriptionModel.find(filter).sort({ visitDate: -1 }).skip(skip).limit(query.limit).select('-__v').lean(),
    PrescriptionModel.countDocuments(filter),
  ]);
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'prescription.list_viewed', targetType: 'Patient', targetId: query.patientId, metadata: { resultCount: prescriptions.length } });
  return { prescriptions, pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

export async function getPrescription(req: Request, prescriptionId: string) {
  const auth = requireAuth(req);
  const prescription = await PrescriptionModel.findOne({ _id: prescriptionId, clinicId: auth.clinicId }).select('-__v').lean();
  if (!prescription) throw new AppError(404, 'NOT_FOUND', 'Prescription not found');
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'prescription.viewed', targetType: 'Prescription', targetId: prescriptionId });
  return prescription;
}

export async function getPrescriptionPdf(req: Request, prescriptionId: string) {
  const auth = requireAuth(req);
  const pdf = await createPrescriptionPdf(auth.clinicId, prescriptionId);
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'prescription.pdf_viewed', targetType: 'Prescription', targetId: prescriptionId });
  return pdf;
}

export async function getPrescriptionPdfDownload(req: Request, prescriptionId: string) {
  const auth = requireAuth(req);
  const pdf = await createPrescriptionPdf(auth.clinicId, prescriptionId);
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'prescription.pdf_downloaded', targetType: 'Prescription', targetId: prescriptionId });
  return pdf;
}

export function maskPatientName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((part) => {
      if (!part) return '';
      if (part.length <= 2) return `${part[0]}*`;
      return `${part[0]}${'*'.repeat(part.length - 2)}${part[part.length - 1]}`;
    })
    .filter(Boolean)
    .join(' ');
}

export async function getPrescriptionAccessStatus(req: Request, prescriptionId: string) {
  const auth = requireAuth(req);
  const prescription = await PrescriptionModel.findOne({ _id: prescriptionId, clinicId: auth.clinicId }).lean();
  if (!prescription) throw new AppError(404, 'NOT_FOUND', 'Prescription not found');

  const latestLink = await PrescriptionShareLinkModel.findOne({ clinicId: auth.clinicId, prescriptionId })
    .sort({ createdAt: -1 })
    .select('+tokenEncrypted')
    .lean();

  let activeLinkData: {
    id: string;
    status: 'active' | 'expired' | 'revoked' | 'access_limit_reached';
    expiresAt: string;
    maxViews: number;
    viewCount: number;
    createdAt: string;
  } | null = null;

  let url: string | undefined;
  let qrCodeDataUrl: string | undefined;
  let accessStatus = 'Not Generated';

  if (latestLink) {
    let computedStatus: 'active' | 'expired' | 'revoked' | 'access_limit_reached' = 'active';
    if (latestLink.revokedAt || latestLink.status === 'revoked') {
      computedStatus = 'revoked';
      accessStatus = 'Revoked';
    } else if (latestLink.viewCount >= latestLink.maxViews) {
      computedStatus = 'access_limit_reached';
      accessStatus = 'Limit Reached';
    } else if (new Date(latestLink.expiresAt).getTime() < Date.now()) {
      computedStatus = 'expired';
      accessStatus = 'Expired';
    } else {
      computedStatus = 'active';
      accessStatus = 'Active';
    }

    activeLinkData = {
      id: String(latestLink._id),
      status: computedStatus,
      expiresAt: new Date(latestLink.expiresAt).toISOString(),
      maxViews: latestLink.maxViews,
      viewCount: latestLink.viewCount,
      createdAt: new Date(latestLink.createdAt).toISOString(),
    };

    if (computedStatus === 'active' && latestLink.tokenEncrypted) {
      try {
        const rawToken = decrypt(latestLink.tokenEncrypted);
        url = `${env.CLIENT_URL.replace(/\/$/, '')}/prescription/${rawToken}`;
        qrCodeDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'H', type: 'image/png' });
      } catch {
        // Fallback gracefully if decryption is unavailable
      }
    }
  }

  // Build timeline
  const timeline: Array<{ id: string; action: string; title: string; timestamp: string; description: string }> = [];

  // 1. Prescription created event
  timeline.push({
    id: `${prescriptionId}-created`,
    action: 'prescription.created',
    title: 'Prescription Finalized',
    timestamp: new Date(prescription.clinicianConfirmedAt ?? prescription.createdAt).toISOString(),
    description: 'Prescription confirmed and locked by doctor.',
  });

  // 2. Share link events
  const links = await PrescriptionShareLinkModel.find({ clinicId: auth.clinicId, prescriptionId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  for (const l of links) {
    timeline.push({
      id: `${l._id}-created`,
      action: 'share_link.created',
      title: 'Patient Access Generated',
      timestamp: new Date(l.createdAt).toISOString(),
      description: `Secure patient QR and access link generated (expires ${new Date(l.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`,
    });

    if (l.revokedAt) {
      timeline.push({
        id: `${l._id}-revoked`,
        action: 'share_link.revoked',
        title: 'Patient Access Revoked',
        timestamp: new Date(l.revokedAt).toISOString(),
        description: 'Clinician revoked active patient share link.',
      });
    }

    if (l.viewCount > 0) {
      timeline.push({
        id: `${l._id}-viewed`,
        action: 'share_link.viewed',
        title: 'Prescription Viewed',
        timestamp: new Date(l.updatedAt).toISOString(),
        description: `Patient accessed prescription via secure link (${l.viewCount} of ${l.maxViews} views).`,
      });
    }
  }

  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    prescriptionId,
    pdfStatus: 'Ready',
    accessStatus,
    activeLink: activeLinkData,
    url,
    qrCodeDataUrl,
    timeline,
  };
}

export async function createPrescriptionShareLink(req: Request, prescriptionId: string) {
  const auth = requireAuth(req);
  const prescription = await PrescriptionModel.findOne({ _id: prescriptionId, clinicId: auth.clinicId }).lean();
  if (!prescription) throw new AppError(404, 'NOT_FOUND', 'Prescription not found');

  // Invalidate any previously active share links for this prescription
  await PrescriptionShareLinkModel.updateMany(
    { clinicId: auth.clinicId, prescriptionId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), status: 'revoked' } },
  );

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashIdentifier(rawToken);
  const tokenEncrypted = encrypt(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const shareLink = await PrescriptionShareLinkModel.create({
    clinicId: auth.clinicId,
    prescriptionId,
    patientId: prescription.patientId,
    tokenHash,
    tokenEncrypted,
    expiresAt,
    maxViews: 20,
    viewCount: 0,
    status: 'active',
  });

  const url = `${env.CLIENT_URL.replace(/\/$/, '')}/prescription/${rawToken}`;
  const qrCodeDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'H', type: 'image/png' });

  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'prescription.share_link_created',
    targetType: 'Prescription',
    targetId: prescriptionId,
    metadata: { shareLinkId: String(shareLink._id), expiresAt: expiresAt.toISOString(), maxViews: 20 },
  });

  return {
    shareLink: {
      id: String(shareLink._id),
      status: 'active' as const,
      expiresAt: shareLink.expiresAt.toISOString(),
      maxViews: shareLink.maxViews,
      viewCount: shareLink.viewCount,
      createdAt: shareLink.createdAt.toISOString(),
    },
    url,
    qrCodeDataUrl,
    rawToken,
  };
}

export async function revokePrescriptionShareLink(req: Request, prescriptionId: string, shareLinkId: string) {
  const auth = requireAuth(req);
  const updated = await PrescriptionShareLinkModel.findOneAndUpdate(
    { _id: shareLinkId, clinicId: auth.clinicId, prescriptionId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), status: 'revoked' } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new AppError(404, 'NOT_FOUND', 'Active share link not found');

  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'prescription.share_link_revoked',
    targetType: 'Prescription',
    targetId: prescriptionId,
    metadata: { shareLinkId },
  });

  return { revoked: true };
}

export async function getPublicPrescriptionSummary(token: string) {
  const tokenHash = hashIdentifier(token);
  const link = await PrescriptionShareLinkModel.findOne({ tokenHash }).lean();
  if (!link) throw new AppError(404, 'NOT_FOUND', 'Prescription link not found');
  if (link.revokedAt || link.status === 'revoked') {
    throw new AppError(410, 'GONE', 'This prescription link has been revoked by the clinic');
  }
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    throw new AppError(410, 'GONE', 'This prescription link has expired');
  }
  if (link.viewCount >= link.maxViews) {
    throw new AppError(410, 'GONE', 'This prescription link has reached its maximum view limit');
  }

  const [clinic, patient, prescription] = await Promise.all([
    ClinicModel.findOne({ _id: link.clinicId, status: 'active' }).select('name phone').lean(),
    PatientModel.findOne({ _id: link.patientId, clinicId: link.clinicId, isDeleted: false }).select('name').lean(),
    PrescriptionModel.findOne({ _id: link.prescriptionId, clinicId: link.clinicId }).select('doctorId visitDate').lean(),
  ]);

  if (!clinic || !patient || !prescription) {
    throw new AppError(404, 'NOT_FOUND', 'Prescription record not found');
  }

  const doctor = await UserModel.findOne({ _id: prescription.doctorId, clinicId: link.clinicId, role: 'doctor' }).select('name').lean();
  if (!doctor) throw new AppError(404, 'NOT_FOUND', 'Doctor profile not found');

  return {
    clinicName: clinic.name,
    clinicPhone: clinic.phone ?? '',
    doctorName: doctor.name,
    maskedPatientName: maskPatientName(patient.name),
    issueDate: new Date(prescription.visitDate).toISOString(),
    expiresAt: new Date(link.expiresAt).toISOString(),
    viewCount: link.viewCount,
    maxViews: link.maxViews,
  };
}

export async function getPublicPrescriptionPdf(token: string) {
  const tokenHash = hashIdentifier(token);
  const link = await PrescriptionShareLinkModel.findOne({ tokenHash });
  if (!link) throw new AppError(404, 'NOT_FOUND', 'Prescription link not found');
  if (link.revokedAt || link.status === 'revoked') {
    throw new AppError(410, 'GONE', 'This prescription link has been revoked by the clinic');
  }
  if (new Date(link.expiresAt).getTime() < Date.now()) {
    throw new AppError(410, 'GONE', 'This prescription link has expired');
  }
  if (link.viewCount >= link.maxViews) {
    throw new AppError(410, 'GONE', 'This prescription link has reached its maximum view limit');
  }

  const updated = await PrescriptionShareLinkModel.findOneAndUpdate(
    { _id: link._id, viewCount: { $lt: link.maxViews }, revokedAt: { $exists: false } },
    { $inc: { viewCount: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw new AppError(410, 'GONE', 'This prescription link has reached its maximum view limit');
  }

  if (updated.viewCount >= updated.maxViews) {
    await PrescriptionShareLinkModel.updateOne({ _id: link._id }, { $set: { status: 'access_limit_reached' } });
  }

  const pdf = await createPrescriptionPdf(String(link.clinicId), String(link.prescriptionId));

  await recordAudit({
    clinicId: String(link.clinicId),
    action: 'prescription.public_pdf_viewed',
    targetType: 'Prescription',
    targetId: String(link.prescriptionId),
    metadata: { shareLinkId: String(link._id), viewCount: updated.viewCount },
  });

  return pdf;
}

