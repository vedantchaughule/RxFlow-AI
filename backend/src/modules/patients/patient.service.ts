import type { Request } from 'express';
import { AppError } from '../../shared/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { UserModel } from '../users/user.model.js';
import { PatientModel } from './patient.model.js';
import { QueueCounterModel, VisitQueueModel, type QueueStatus } from './visit-queue.model.js';
import type { PatientCheckInInput, PatientCreateInput, PatientFollowUpInput, PatientHistoryQuery, PatientListQuery, QueueListQuery } from './patient.schemas.js';
import { createPatientQrMaterial, renderPatientQr } from './patient-qr.service.js';

const PATIENT_FIELDS = 'clinicId assignedDoctorId registeredById name phone age gender bloodGroup chiefComplaint communicationConsent totalVisits lastVisitDate nextAppointmentId dropoutStatus createdAt updatedAt';
const INDIA_TIME_ZONE = 'Asia/Kolkata';

function requireAuth(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  return req.auth;
}

export function normalizePatientName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function clinicDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return '******';
  return `${phone.slice(0, 3)}${'*'.repeat(Math.max(4, phone.length - 7))}${phone.slice(-4)}`;
}

function patientSearchSummary(patient: Record<string, unknown>) {
  return {
    _id: patient._id,
    name: patient.name,
    maskedPhone: maskPhone(String(patient.phone)),
    age: patient.age,
    gender: patient.gender,
    assignedDoctorId: patient.assignedDoctorId,
    totalVisits: patient.totalVisits,
    lastVisitDate: patient.lastVisitDate,
  };
}

function publicPatient(patient: Record<string, unknown>) {
  const {
    normalizedName: _normalizedName,
    isDeleted: _isDeleted,
    deletedAt: _deletedAt,
    qrTokenHash: _qrTokenHash,
    qrTokenEncrypted: _qrTokenEncrypted,
    __v: _version,
    ...result
  } = patient;
  return result;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

async function assertDoctor(clinicId: string, doctorId: string): Promise<void> {
  const doctor = await UserModel.exists({ _id: doctorId, clinicId, role: 'doctor', status: 'active' });
  if (!doctor) throw new AppError(404, 'NOT_FOUND', 'Doctor not found');
}

async function allocateQueueNumber(clinicId: string, doctorId: string, queueDate: string): Promise<number> {
  const counter = await QueueCounterModel.findOneAndUpdate(
    { _id: `${clinicId}:${doctorId}:${queueDate}` },
    { $inc: { sequence: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  if (!counter) throw new AppError(500, 'INTERNAL_ERROR', 'Unable to allocate queue number');
  return counter.sequence;
}

export async function createQueueEntry(input: { clinicId: string; patientId: string; doctorId: string; checkedInById: string }) {
  const queueDate = clinicDate();
  const existing = await VisitQueueModel.findOne({
    clinicId: input.clinicId,
    patientId: input.patientId,
    $or: [{ queueDate }, { status: { $in: ['waiting', 'in_consultation'] } }],
  }).lean();
  if (existing) throw new AppError(409, 'ALREADY_CHECKED_IN', 'Patient is already checked in today');
  const queueNumber = await allocateQueueNumber(input.clinicId, input.doctorId, queueDate);
  try {
    return await VisitQueueModel.create({ ...input, queueDate, queueNumber, status: 'waiting', checkedInAt: new Date() });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, 'ALREADY_CHECKED_IN', 'Patient is already checked in today');
    throw error;
  }
}

export async function createPatient(req: Request, input: PatientCreateInput) {
  const auth = requireAuth(req);
  await assertDoctor(auth.clinicId, input.assignedDoctorId);
  const qrMaterial = createPatientQrMaterial();
  const qrCode = { ...(await renderPatientQr(qrMaterial.token)), issuedAt: qrMaterial.issuedAt };
  let patient;
  try {
    patient = await PatientModel.create({
      clinicId: auth.clinicId,
      assignedDoctorId: input.assignedDoctorId,
      registeredById: auth.userId,
      name: input.name,
      normalizedName: normalizePatientName(input.name),
      phone: input.phone,
      age: input.age,
      gender: input.gender,
      bloodGroup: input.bloodGroup,
      chiefComplaint: input.chiefComplaint,
      qrTokenHash: qrMaterial.tokenHash,
      qrTokenEncrypted: qrMaterial.tokenEncrypted,
      qrIssuedAt: qrMaterial.issuedAt,
    });
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, 'CONFLICT', 'A patient with this phone number already exists');
    throw error;
  }
  let queueEntryId: string | undefined;
  try {
    const queueEntry = await createQueueEntry({ clinicId: auth.clinicId, patientId: String(patient._id), doctorId: input.assignedDoctorId, checkedInById: auth.userId });
    queueEntryId = String(queueEntry._id);
    await recordAudit({
      req,
      clinicId: auth.clinicId,
      actorUserId: auth.userId,
      action: 'patient.created',
      targetType: 'Patient',
      targetId: String(patient._id),
      metadata: { doctorId: input.assignedDoctorId, queueDate: queueEntry.queueDate, queueNumber: queueEntry.queueNumber },
    });
    return { patient: publicPatient(patient.toObject() as unknown as Record<string, unknown>), queueEntry: queueEntry.toObject(), qrCode };
  } catch (error) {
    if (queueEntryId) await VisitQueueModel.deleteOne({ _id: queueEntryId, clinicId: auth.clinicId });
    await PatientModel.deleteOne({ _id: patient._id, clinicId: auth.clinicId });
    throw error;
  }
}

export async function listPatients(req: Request, query: PatientListQuery) {
  const auth = requireAuth(req);
  const filter: Record<string, unknown> = { clinicId: auth.clinicId, isDeleted: false };
  if (query.doctorId) filter.assignedDoctorId = query.doctorId;
  if (query.search) {
    const normalized = normalizePatientName(query.search);
    filter.normalizedName = query.match === 'prefix' ? { $regex: `^${escapeRegex(normalized)}` } : normalized;
  }
  const skip = (query.page - 1) * query.limit;
  const [patients, total] = await Promise.all([
    PatientModel.find(filter).select(PATIENT_FIELDS).sort({ name: 1, _id: 1 }).skip(skip).limit(query.limit).lean(),
    PatientModel.countDocuments(filter),
  ]);
  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'patient.search_performed',
    targetType: 'PatientSearch',
    metadata: { mode: query.search ? query.match : 'list', resultCount: patients.length },
  });
  return {
    patients: patients.map((patient) => patientSearchSummary(patient as unknown as Record<string, unknown>)),
    pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
  };
}

export async function getPatientHistory(req: Request, patientId: string, query: PatientHistoryQuery) {
  const auth = requireAuth(req);
  const patient = await PatientModel.findOne({ _id: patientId, clinicId: auth.clinicId, isDeleted: false }).select(PATIENT_FIELDS).lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  const visitFilter = { clinicId: auth.clinicId, patientId };
  const skip = (query.page - 1) * query.limit;
  const [visits, totalVisits] = await Promise.all([
    VisitQueueModel.find(visitFilter).sort({ checkedInAt: -1 }).skip(skip).limit(query.limit).select('-__v').lean(),
    VisitQueueModel.countDocuments(visitFilter),
  ]);
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'patient.viewed', targetType: 'Patient', targetId: patientId });
  const patientResponse = publicPatient(patient as unknown as Record<string, unknown>);
  if (auth.role === 'receptionist') delete patientResponse.chiefComplaint;
  const lastVisit = patient.lastVisitDate?.getTime();
  return {
    patient: patientResponse,
    visitHistory: visits,
    visitPagination: { total: totalVisits, page: query.page, limit: query.limit, totalPages: Math.ceil(totalVisits / query.limit) },
    daysSinceLastVisit: lastVisit ? Math.max(0, Math.floor((Date.now() - lastVisit) / 86_400_000)) : null,
  };
}

export async function checkInExistingPatient(req: Request, patientId: string, input: PatientCheckInInput) {
  const auth = requireAuth(req);
  const patient = await PatientModel.findOne({ _id: patientId, clinicId: auth.clinicId, isDeleted: false }).lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  const doctorId = input.doctorId ?? String(patient.assignedDoctorId);
  await assertDoctor(auth.clinicId, doctorId);
  const queueEntry = await createQueueEntry({ clinicId: auth.clinicId, patientId, doctorId, checkedInById: auth.userId });
  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'patient.checked_in',
    targetType: 'Patient',
    targetId: patientId,
    metadata: { doctorId, queueDate: queueEntry.queueDate, queueNumber: queueEntry.queueNumber },
  });
  return { patient: patientSearchSummary(patient as unknown as Record<string, unknown>), queueEntry: queueEntry.toObject() };
}

export async function listQueue(req: Request, query: QueueListQuery) {
  const auth = requireAuth(req);
  const doctorId = auth.role === 'doctor' ? auth.userId : query.doctorId;
  if (auth.role === 'doctor' && query.doctorId && query.doctorId !== auth.userId) throw new AppError(403, 'FORBIDDEN', 'Doctors may only view their own queue');
  const filter: Record<string, unknown> = { clinicId: auth.clinicId, queueDate: query.date ?? clinicDate() };
  if (doctorId) filter.doctorId = doctorId;
  if (query.status) filter.status = query.status;
  const skip = (query.page - 1) * query.limit;
  const [entries, total] = await Promise.all([
    VisitQueueModel.find(filter).sort({ doctorId: 1, queueNumber: 1 }).skip(skip).limit(query.limit).select('-__v').lean(),
    VisitQueueModel.countDocuments(filter),
  ]);
  const patientIds = [...new Set(entries.map((entry) => String(entry.patientId)))];
  const patients = await PatientModel.find({ _id: { $in: patientIds }, clinicId: auth.clinicId, isDeleted: false }).select(PATIENT_FIELDS).lean();
  const byId = new Map(patients.map((patient) => [String(patient._id), patientSearchSummary(patient as unknown as Record<string, unknown>)]));
  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'queue.viewed',
    targetType: 'VisitQueue',
    metadata: { date: String(filter.queueDate), resultCount: entries.length, scope: doctorId ? 'doctor' : 'clinic' },
  });
  return {
    entries: entries.map((entry) => ({ ...entry, patient: byId.get(String(entry.patientId)) })),
    pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
  };
}

export async function updateQueueStatus(req: Request, queueEntryId: string, nextStatus: QueueStatus) {
  const auth = requireAuth(req);
  const current = await VisitQueueModel.findOne({ _id: queueEntryId, clinicId: auth.clinicId });
  if (!current || (auth.role === 'doctor' && String(current.doctorId) !== auth.userId)) throw new AppError(404, 'NOT_FOUND', 'Queue entry not found');
  if (auth.role === 'receptionist' && nextStatus !== 'cancelled') throw new AppError(403, 'FORBIDDEN', 'Receptionists may only cancel queue entries');
  const allowed: Record<QueueStatus, QueueStatus[]> = {
    waiting: ['in_consultation', 'cancelled'],
    in_consultation: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  if (!allowed[current.status].includes(nextStatus)) throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Queue status transition is not allowed');
  const now = new Date();
  const timestampField = nextStatus === 'in_consultation' ? 'consultationStartedAt' : nextStatus === 'completed' ? 'completedAt' : 'cancelledAt';
  const updated = await VisitQueueModel.findOneAndUpdate(
    { _id: current._id, clinicId: auth.clinicId, status: current.status },
    { $set: { status: nextStatus, [timestampField]: now } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!updated) throw new AppError(409, 'CONFLICT', 'Queue entry was changed by another request');
  if (nextStatus === 'completed') {
    await PatientModel.updateOne({ _id: current.patientId, clinicId: auth.clinicId, isDeleted: false }, { $inc: { totalVisits: 1 }, $set: { lastVisitDate: now } });
  }
  await recordAudit({
    req,
    clinicId: auth.clinicId,
    actorUserId: auth.userId,
    action: 'queue.status_changed',
    targetType: 'VisitQueue',
    targetId: queueEntryId,
    metadata: { from: current.status, to: nextStatus },
  });
  return updated;
}

export async function softDeletePatient(req: Request, patientId: string) {
  const auth = requireAuth(req);
  const patient = await PatientModel.findOneAndUpdate(
    { _id: patientId, clinicId: auth.clinicId, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  await VisitQueueModel.updateMany(
    { clinicId: auth.clinicId, patientId, status: { $in: ['waiting', 'in_consultation'] } },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
  );
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'patient.deleted', targetType: 'Patient', targetId: patientId });
  return { deleted: true };
}

export async function setPatientFollowUp(req: Request, patientId: string, input: PatientFollowUpInput) {
  const auth = requireAuth(req);
  const filter = { _id: patientId, clinicId: auth.clinicId, isDeleted: false, ...(auth.role === 'doctor' ? { assignedDoctorId: auth.userId } : {}) };
  const update = input.followupDueDate
    ? { $set: { followupDueDate: new Date(`${input.followupDueDate}T00:00:00.000+05:30`), dropoutStatus: 'active' } }
    : { $unset: { followupDueDate: 1, lastDropoutMessageSentAt: 1 }, $set: { dropoutStatus: 'active', dropoutReplied: false } };
  const patient = await PatientModel.findOneAndUpdate(filter, update, { returnDocument: 'after', runValidators: true }).select('followupDueDate').lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'patient.follow_up_updated', targetType: 'Patient', targetId: patientId, metadata: { hasDueDate: Boolean(input.followupDueDate) } });
  return { patientId, followupDueDate: input.followupDueDate };
}
