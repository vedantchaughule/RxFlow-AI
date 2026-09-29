import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { decrypt, encrypt } from '../../shared/encryption.js';
import { AppError } from '../../shared/errors.js';
import { hashIdentifier } from '../../shared/security.js';
import { recordAudit } from '../audit/audit.service.js';
import type { Request } from 'express';
import { PatientModel } from './patient.model.js';

export type PatientQrMaterial = {
  token: string;
  tokenHash: string;
  tokenEncrypted: string;
  issuedAt: Date;
};

export function createPatientQrMaterial(): PatientQrMaterial {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashIdentifier(token), tokenEncrypted: encrypt(token), issuedAt: new Date() };
}

export function patientQrValue(token: string): string {
  return `${env.CLIENT_URL.replace(/\/$/, '')}/checkin/${token}`;
}

export async function renderPatientQr(token: string) {
  return {
    imageDataUrl: await QRCode.toDataURL(patientQrValue(token), { width: 300, margin: 2, errorCorrectionLevel: 'H', type: 'image/png' }),
    contentType: 'image/png' as const,
    format: 'png' as const,
    containsPatientData: false as const,
  };
}

export async function getOrCreatePatientQr(req: Request, patientId: string) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  let patient = await PatientModel.findOne({ _id: patientId, clinicId: req.auth.clinicId, isDeleted: false }).select('+qrTokenEncrypted +qrTokenHash');
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  let token: string;
  if (patient.qrTokenEncrypted) {
    token = decrypt(patient.qrTokenEncrypted);
  } else {
    const material = createPatientQrMaterial();
    const updated = await PatientModel.findOneAndUpdate(
      { _id: patient._id, clinicId: req.auth.clinicId, isDeleted: false, qrTokenEncrypted: { $exists: false } },
      { $set: { qrTokenHash: material.tokenHash, qrTokenEncrypted: material.tokenEncrypted, qrIssuedAt: material.issuedAt } },
      { returnDocument: 'after' },
    ).select('+qrTokenEncrypted +qrTokenHash');
    patient = updated ?? await PatientModel.findOne({ _id: patient._id, clinicId: req.auth.clinicId, isDeleted: false }).select('+qrTokenEncrypted +qrTokenHash');
    if (!patient?.qrTokenEncrypted) throw new AppError(500, 'INTERNAL_ERROR', 'Unable to issue patient QR code');
    token = decrypt(patient.qrTokenEncrypted);
    await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'patient.qr_issued', targetType: 'Patient', targetId: patientId });
  }
  return { ...(await renderPatientQr(token)), issuedAt: patient.qrIssuedAt };
}

export async function resolvePatientQr(req: Request, token: string) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const patient = await PatientModel.findOne({ clinicId: req.auth.clinicId, qrTokenHash: hashIdentifier(token), isDeleted: false })
    .select('name phone age gender assignedDoctorId totalVisits lastVisitDate')
    .lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  const phone = patient.phone;
  const maskedPhone = `${phone.slice(0, 3)}${'*'.repeat(Math.max(4, phone.length - 7))}${phone.slice(-4)}`;
  await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'patient.qr_resolved', targetType: 'Patient', targetId: String(patient._id) });
  return {
    _id: patient._id,
    name: patient.name,
    maskedPhone,
    age: patient.age,
    gender: patient.gender,
    assignedDoctorId: patient.assignedDoctorId,
    totalVisits: patient.totalVisits,
    lastVisitDate: patient.lastVisitDate,
  };
}

export async function rotatePatientQr(req: Request, patientId: string) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const material = createPatientQrMaterial();
  const patient = await PatientModel.findOneAndUpdate(
    { _id: patientId, clinicId: req.auth.clinicId, isDeleted: false },
    { $set: { qrTokenHash: material.tokenHash, qrTokenEncrypted: material.tokenEncrypted, qrIssuedAt: material.issuedAt } },
    { returnDocument: 'after' },
  ).lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'patient.qr_rotated', targetType: 'Patient', targetId: patientId });
  return { ...(await renderPatientQr(material.token)), issuedAt: material.issuedAt };
}

export async function publicSelfCheckInQr(token: string) {
  const patient = await PatientModel.findOne({ qrTokenHash: hashIdentifier(token), isDeleted: false })
    .select('_id clinicId assignedDoctorId registeredById')
    .lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Check-in token not found or invalid');
  const { createQueueEntry } = await import('./patient.service.js');
  const queueEntry = await createQueueEntry({
    clinicId: String(patient.clinicId),
    patientId: String(patient._id),
    doctorId: String(patient.assignedDoctorId),
    checkedInById: String(patient.registeredById),
  });
  return { queueNumber: queueEntry.queueNumber, status: queueEntry.status };
}
