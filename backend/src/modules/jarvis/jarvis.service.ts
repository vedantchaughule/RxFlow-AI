import crypto from 'node:crypto';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { CommunicationMessageModel } from '../communications/communication-message.model.js';
import { InventoryMedicineModel } from '../inventory/inventory.model.js';
import { inventoryStatus } from '../inventory/inventory.service.js';
import { PatientModel } from '../patients/patient.model.js';
import { clinicDate } from '../patients/patient.service.js';
import { VisitQueueModel } from '../patients/visit-queue.model.js';
import { PrescriptionModel } from '../prescriptions/prescription.model.js';
import { JarvisActionModel, JarvisSessionModel } from './jarvis.model.js';
import { signJarvisToken } from './jarvis-token.js';
import { toolArgumentSchemas, type JarvisToolName } from './jarvis.schemas.js';

function requireDoctor(req: Request) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  if (req.auth.role !== 'doctor') throw new AppError(403, 'FORBIDDEN', 'Jarvis clinical assistance is restricted to doctors');
  return req.auth;
}

const expiresInMs = () => env.JARVIS_SESSION_TTL_SECONDS * 1000;
const patientCode = (id: unknown) => `RXF-${String(id).slice(-6).toUpperCase()}`;
const maskedPhone = (phone?: string) => phone ? `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}` : undefined;
const payloadHash = (payload: unknown) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

async function validSession(sessionId: string) {
  const session = await JarvisSessionModel.findOne({ sessionId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError(401, 'JARVIS_SESSION_EXPIRED', 'Jarvis session expired');
  session.lastActivityAt = new Date();
  await session.save();
  return session;
}

function tokenFor(session: { sessionId: string; clinicId: unknown; doctorId: unknown; tokenVersion: number; boundPatientId?: unknown; boundQueueEntryId?: unknown }) {
  return signJarvisToken({ sessionId: session.sessionId, clinicId: String(session.clinicId), doctorId: String(session.doctorId), role: 'doctor', tokenVersion: session.tokenVersion, boundPatientId: session.boundPatientId ? String(session.boundPatientId) : undefined, boundQueueEntryId: session.boundQueueEntryId ? String(session.boundQueueEntryId) : undefined });
}

export async function createSession(req: Request, body: { patientId?: string; queueEntryId?: string }) {
  const actor = requireDoctor(req);
  if (!env.JARVIS_ENABLED) throw new AppError(503, 'JARVIS_DISABLED', 'Jarvis is disabled');
  if (!env.JARVIS_AGENT_URL || !env.JARVIS_SESSION_JWT_SECRET || !env.JARVIS_INTERNAL_HMAC_SECRET) throw new AppError(503, 'JARVIS_NOT_CONFIGURED', 'Jarvis is not configured');
  let patientId = body.patientId;
  let queueEntryId = body.queueEntryId;
  if (patientId || queueEntryId) {
    if (!patientId || !queueEntryId) throw new AppError(400, 'VALIDATION_ERROR', 'Patient and queue entry must be provided together');
    const queue = await VisitQueueModel.findOne({ _id: queueEntryId, clinicId: actor.clinicId, doctorId: actor.userId, patientId, status: 'in_consultation' }).lean();
    if (!queue) throw new AppError(404, 'NOT_FOUND', 'Active consultation not found');
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInMs());
  const session = await JarvisSessionModel.create({ sessionId, clinicId: actor.clinicId, doctorId: actor.userId, boundPatientId: patientId, boundQueueEntryId: queueEntryId, tokenVersion: 1, expiresAt });
  await recordAudit({ req, clinicId: actor.clinicId, actorUserId: actor.userId, action: 'jarvis.session_created', targetType: 'JarvisSession', targetId: sessionId, metadata: { patientBound: Boolean(patientId) } });
  return { sessionId, token: tokenFor(session), expiresAt: expiresAt.toISOString(), agentUrl: env.JARVIS_AGENT_URL, boundPatientId: patientId ?? null, boundQueueEntryId: queueEntryId ?? null };
}

export async function confirmAction(req: Request, sessionId: string, actionId: string) {
  const actor = requireDoctor(req);
  const session = await JarvisSessionModel.findOne({ sessionId, clinicId: actor.clinicId, doctorId: actor.userId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!session) throw new AppError(404, 'NOT_FOUND', 'Jarvis session not found');
  const action = await JarvisActionModel.findOne({ actionId, sessionId, clinicId: actor.clinicId, doctorId: actor.userId, status: 'pending', expiresAt: { $gt: new Date() } });
  if (!action) throw new AppError(404, 'ACTION_EXPIRED', 'Jarvis action expired or was already used');
  if (payloadHash(action.payload) !== action.payloadHash) throw new AppError(409, 'ACTION_TAMPERED', 'Jarvis action payload changed');
  if (action.type === 'confirm_patient_binding') {
    if (!action.patientId) throw new AppError(400, 'INVALID_ACTION', 'Patient binding action is incomplete');
    const patient = await PatientModel.findOne({ _id: action.patientId, clinicId: actor.clinicId, assignedDoctorId: actor.userId, isDeleted: false }).lean();
    if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
    const queueEntryId = action.queueEntryId;
    if (queueEntryId) {
      const queue = await VisitQueueModel.findOne({ _id: queueEntryId, clinicId: actor.clinicId, doctorId: actor.userId, patientId: action.patientId, status: { $in: ['waiting', 'in_consultation'] } }).lean();
      if (!queue) throw new AppError(404, 'NOT_FOUND', 'Patient queue entry not found');
    }
    await JarvisActionModel.updateMany({ sessionId, status: 'pending', actionId: { $ne: actionId } }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
    session.boundPatientId = action.patientId;
    session.boundQueueEntryId = queueEntryId;
    session.tokenVersion += 1;
    await session.save();
  } else if (action.type === 'review_prescription_draft') {
    if (!action.patientId || String(action.patientId) !== String(session.boundPatientId)) throw new AppError(409, 'ACTION_STALE', 'The patient changed after this draft was created');
    if (String(action.queueEntryId ?? '') !== String(session.boundQueueEntryId ?? '')) throw new AppError(409, 'ACTION_STALE', 'The consultation changed after this draft was created');
    if (action.queueEntryId) {
      const queue = await VisitQueueModel.findOne({ _id: action.queueEntryId, clinicId: actor.clinicId, doctorId: actor.userId, patientId: action.patientId, status: 'in_consultation' }).lean();
      if (!queue) throw new AppError(409, 'CONSULTATION_NOT_ACTIVE', 'The consultation is no longer active');
    }
  }
  action.status = 'confirmed';
  action.confirmedAt = new Date();
  await action.save();
  await recordAudit({ req, clinicId: actor.clinicId, actorUserId: actor.userId, action: 'jarvis.action_confirmed', targetType: 'JarvisAction', targetId: actionId, metadata: { type: action.type, sessionId } });
  const actionPayload = action.type === 'review_prescription_draft' && typeof action.payload === 'object' && action.payload !== null && 'draft' in action.payload ? (action.payload as { draft: unknown }).draft : undefined;
  return { actionId, status: action.status, token: tokenFor(session), expiresAt: session.expiresAt.toISOString(), boundPatientId: session.boundPatientId ? String(session.boundPatientId) : null, boundQueueEntryId: session.boundQueueEntryId ? String(session.boundQueueEntryId) : null, ...(actionPayload ? { actionPayload } : {}) };
}

export async function cancelAction(req: Request, sessionId: string, actionId: string) {
  const actor = requireDoctor(req);
  const action = await JarvisActionModel.findOneAndUpdate({ actionId, sessionId, clinicId: actor.clinicId, doctorId: actor.userId, status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: new Date() } }, { returnDocument: 'after' });
  if (!action) throw new AppError(404, 'NOT_FOUND', 'Jarvis action not found');
  return { actionId, status: action.status };
}

function safePatient(patient: Record<string, unknown>, queue?: Record<string, unknown> | null) {
  return { id: String(patient._id), patientCode: patientCode(patient._id), name: patient.name, age: patient.age, gender: patient.gender, maskedPhone: maskedPhone(String(patient.phone ?? '')), queueEntryId: queue?._id ? String(queue._id) : undefined, queueNumber: queue?.queueNumber, queueStatus: queue?.status };
}

async function lookupPatient(session: Awaited<ReturnType<typeof validSession>>, args: Record<string, unknown>) {
  const query = String(args.query ?? '').trim();
  const lookupType = String(args.lookupType ?? 'auto');
  if (!query) throw new AppError(400, 'VALIDATION_ERROR', 'Patient lookup query is required');
  const base = { clinicId: session.clinicId, assignedDoctorId: session.doctorId, isDeleted: false };
  const today = clinicDate();
  if (lookupType === 'queue_number' || /queue\s*(?:number)?\s*\d+/i.test(query)) {
    const number = Number(query.match(/\d+/)?.[0]);
    const queue = await VisitQueueModel.findOne({ clinicId: session.clinicId, doctorId: session.doctorId, queueDate: today, queueNumber: number, status: { $in: ['waiting', 'in_consultation'] } }).lean();
    if (!queue) return { status: 'no_match', matches: [] };
    const patient = await PatientModel.findOne({ ...base, _id: queue.patientId }).lean();
    return patient ? { status: 'exact_match', patient: safePatient(patient as unknown as Record<string, unknown>, queue as unknown as Record<string, unknown>) } : { status: 'no_match', matches: [] };
  }
  const normalizedCode = query.replace(/\s+/g, '').toUpperCase();
  if (lookupType === 'patient_id' || /^[A-F\d]{24}$/i.test(query) || /^RXF-[A-F\d]{6}$/i.test(normalizedCode)) {
    let patient = /^[A-F\d]{24}$/i.test(query) ? await PatientModel.findOne({ ...base, _id: query }).lean() : null;
    if (!patient && /^RXF-[A-F\d]{6}$/i.test(normalizedCode)) {
      const matches = await PatientModel.aggregate([
        { $match: base },
        { $addFields: { jarvisPatientCode: { $concat: ['RXF-', { $toUpper: { $substrBytes: [{ $toString: '$_id' }, 18, 6] } }] } } },
        { $match: { jarvisPatientCode: normalizedCode } },
        { $project: { _id: 1, name: 1, age: 1, gender: 1, phone: 1, assignedDoctorId: 1 } },
        { $limit: 1 },
      ]);
      patient = matches[0] ?? null;
    }
    if (!patient) return { status: 'no_match', matches: [] };
    const queue = await VisitQueueModel.findOne({ clinicId: session.clinicId, doctorId: session.doctorId, patientId: patient._id, status: { $in: ['waiting', 'in_consultation'] } }).sort({ checkedInAt: -1 }).lean();
    return { status: 'exact_match', patient: safePatient(patient as unknown as Record<string, unknown>, queue as unknown as Record<string, unknown> | null) };
  }
  const normalizedName = query.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const patients = await PatientModel.find({ ...base, normalizedName: { $regex: `^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } }).select('+normalizedName').limit(10).lean();
  if (!patients.length) return { status: 'no_match', matches: [] };
  const queueEntries = await VisitQueueModel.find({ clinicId: session.clinicId, doctorId: session.doctorId, patientId: { $in: patients.map((patient) => patient._id) }, status: { $in: ['waiting', 'in_consultation'] } }).lean();
  const queueByPatient = new Map(queueEntries.map((entry) => [String(entry.patientId), entry]));
  const matches = patients.map((patient) => safePatient(patient as unknown as Record<string, unknown>, queueByPatient.get(String(patient._id)) as unknown as Record<string, unknown> | null));
  return matches.length === 1 ? { status: 'exact_match', patient: matches[0] } : { status: 'multiple_matches', matches };
}

async function proposePatientBinding(session: Awaited<ReturnType<typeof validSession>>, args: Record<string, unknown>) {
  const patientId = String(args.patientId ?? '');
  if (!Types.ObjectId.isValid(patientId)) throw new AppError(400, 'VALIDATION_ERROR', 'Valid patientId required');
  const patient = await PatientModel.findOne({ _id: patientId, clinicId: session.clinicId, assignedDoctorId: session.doctorId, isDeleted: false }).lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  let queue = null;
  const suppliedQueue = args.queueEntryId ? String(args.queueEntryId) : undefined;
  if (suppliedQueue) queue = await VisitQueueModel.findOne({ _id: suppliedQueue, clinicId: session.clinicId, doctorId: session.doctorId, patientId, status: { $in: ['waiting', 'in_consultation'] } }).lean();
  if (!queue) queue = await VisitQueueModel.findOne({ clinicId: session.clinicId, doctorId: session.doctorId, patientId, status: { $in: ['waiting', 'in_consultation'] } }).sort({ checkedInAt: -1 }).lean();
  const payload = { patientId, queueEntryId: queue ? String(queue._id) : null };
  const existing = await JarvisActionModel.findOne({
    sessionId: session.sessionId,
    clinicId: session.clinicId,
    doctorId: session.doctorId,
    type: 'confirm_patient_binding',
    patientId,
    queueEntryId: queue?._id,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).lean();
  if (existing) return { actionId: existing.actionId, type: 'confirm_patient_binding', expiresAt: existing.expiresAt.toISOString(), patient: safePatient(patient as unknown as Record<string, unknown>, queue as unknown as Record<string, unknown> | null) };
  const actionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await JarvisActionModel.create({ actionId, sessionId: session.sessionId, clinicId: session.clinicId, doctorId: session.doctorId, type: 'confirm_patient_binding', patientId, queueEntryId: queue?._id, payload, payloadHash: payloadHash(payload), expiresAt });
  return { actionId, type: 'confirm_patient_binding', expiresAt: expiresAt.toISOString(), patient: safePatient(patient as unknown as Record<string, unknown>, queue as unknown as Record<string, unknown> | null) };
}

async function proposePrescriptionDraft(session: Awaited<ReturnType<typeof validSession>>, args: Record<string, unknown>) {
  if (!session.boundPatientId) throw new AppError(409, 'PATIENT_CONFIRMATION_REQUIRED', 'Confirm a patient first');
  if (!session.boundQueueEntryId) throw new AppError(409, 'CONSULTATION_NOT_ACTIVE', 'Start the patient consultation before preparing a prescription draft');
  const draft = (args as { draft?: unknown }).draft;
  const payload = { patientId: String(session.boundPatientId), queueEntryId: String(session.boundQueueEntryId), draft };
  const queue = await VisitQueueModel.findOne({ _id: session.boundQueueEntryId, clinicId: session.clinicId, doctorId: session.doctorId, patientId: session.boundPatientId, status: 'in_consultation' }).lean();
  if (!queue) throw new AppError(409, 'CONSULTATION_NOT_ACTIVE', 'The confirmed consultation is no longer active');
  await JarvisActionModel.updateMany({ sessionId: session.sessionId, type: 'review_prescription_draft', status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
  const actionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await JarvisActionModel.create({
    actionId,
    sessionId: session.sessionId,
    clinicId: session.clinicId,
    doctorId: session.doctorId,
    type: 'review_prescription_draft',
    patientId: session.boundPatientId,
    queueEntryId: session.boundQueueEntryId,
    payload,
    payloadHash: payloadHash(payload),
    expiresAt,
  });
  return { actionId, type: 'review_prescription_draft', expiresAt: expiresAt.toISOString(), payload: draft };
}

async function patientContext(session: Awaited<ReturnType<typeof validSession>>) {
  if (!session.boundPatientId) throw new AppError(409, 'PATIENT_CONFIRMATION_REQUIRED', 'Confirm a patient first');
  const patient = await PatientModel.findOne({ _id: session.boundPatientId, clinicId: session.clinicId, assignedDoctorId: session.doctorId, isDeleted: false }).select('_id name age gender bloodGroup totalVisits lastVisitDate chiefComplaint').lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  const queue = session.boundQueueEntryId ? await VisitQueueModel.findOne({ _id: session.boundQueueEntryId, clinicId: session.clinicId, doctorId: session.doctorId, patientId: session.boundPatientId }).lean() : null;
  return { ...safePatient(patient as unknown as Record<string, unknown>, queue as unknown as Record<string, unknown> | null), bloodGroup: patient.bloodGroup, totalVisits: patient.totalVisits, lastVisitDate: patient.lastVisitDate, chiefComplaint: patient.chiefComplaint };
}

async function queueStatus(session: Awaited<ReturnType<typeof validSession>>, args: Record<string, unknown>) {
  const mode = String(args.mode ?? 'remaining');
  const date = String(args.date ?? clinicDate());
  const entries = await VisitQueueModel.find({ clinicId: session.clinicId, doctorId: session.doctorId, queueDate: date, status: { $in: ['waiting', 'in_consultation'] } }).sort({ queueNumber: 1 }).lean();
  const waiting = entries.filter((entry) => entry.status === 'waiting');
  const current = entries.find((entry) => entry.status === 'in_consultation');
  const patientIds = entries.map((entry) => entry.patientId);
  const patients = await PatientModel.find({ _id: { $in: patientIds }, clinicId: session.clinicId }).select('_id name age gender phone').lean();
  const byId = new Map(patients.map((patient) => [String(patient._id), patient]));
  const mapped = entries.map((entry) => ({ queueEntryId: String(entry._id), queueNumber: entry.queueNumber, status: entry.status, patient: byId.get(String(entry.patientId)) ? safePatient(byId.get(String(entry.patientId)) as unknown as Record<string, unknown>, entry as unknown as Record<string, unknown>) : undefined }));
  if (mode === 'next') return { mode, next: mapped.find((entry) => entry.status === 'waiting') ?? null };
  if (mode === 'current') return { mode, current: mapped.find((entry) => entry.status === 'in_consultation') ?? null };
  if (mode === 'list') return { mode, entries: mapped };
  return { mode: 'remaining', remainingPatients: waiting.length, current: current ? mapped.find((entry) => entry.queueEntryId === String(current._id)) : null };
}

async function searchInventory(session: Awaited<ReturnType<typeof validSession>>, args: Record<string, unknown>) {
  const query = String(args.query ?? '').trim();
  if (!query) throw new AppError(400, 'VALIDATION_ERROR', 'Inventory search query is required');
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const items = await InventoryMedicineModel.find({ clinicId: session.clinicId, isActive: true, $or: [{ name: { $regex: safe, $options: 'i' } }, { genericName: { $regex: safe, $options: 'i' } }, { brandName: { $regex: safe, $options: 'i' } }, { strength: { $regex: safe, $options: 'i' } }] }).sort({ name: 1 }).limit(12).lean();
  return { query, items: items.map((item) => ({ id: String(item._id), name: item.name, genericName: item.genericName, brandName: item.brandName, dosageForm: item.dosageForm, strength: item.strength, stockQuantity: item.stockQuantity, reorderLevel: item.reorderLevel, unit: item.unit, status: inventoryStatus(item.stockQuantity, item.reorderLevel) })) };
}

async function lowStock(session: Awaited<ReturnType<typeof validSession>>) {
  const items = await InventoryMedicineModel.find({ clinicId: session.clinicId, isActive: true, $expr: { $lte: ['$stockQuantity', '$reorderLevel'] } }).sort({ stockQuantity: 1 }).limit(25).lean();
  return { items: items.map((item) => ({ id: String(item._id), name: item.name, strength: item.strength, stockQuantity: item.stockQuantity, reorderLevel: item.reorderLevel, unit: item.unit, status: inventoryStatus(item.stockQuantity, item.reorderLevel) })) };
}

async function recentPrescriptions(session: Awaited<ReturnType<typeof validSession>>, args: Record<string, unknown>) {
  if (!session.boundPatientId) throw new AppError(409, 'PATIENT_CONFIRMATION_REQUIRED', 'Confirm a patient first');
  const limit = Math.min(5, Math.max(1, Number(args.limit ?? 3)));
  const items = await PrescriptionModel.find({ clinicId: session.clinicId, doctorId: session.doctorId, patientId: session.boundPatientId }).sort({ visitDate: -1 }).limit(limit).lean();
  return { items: items.map((item) => ({ id: String(item._id), visitDate: item.visitDate, diagnosis: item.diagnosis, medicines: item.medicines.map((medicine) => ({ name: medicine.name, dosage: medicine.dosage, frequency: medicine.frequency, duration: medicine.duration })) })) };
}

async function communicationStatus(session: Awaited<ReturnType<typeof validSession>>, args: Record<string, unknown>) {
  if (!session.boundPatientId && !args.patientId) throw new AppError(409, 'PATIENT_CONFIRMATION_REQUIRED', 'Confirm a patient first');
  const patientId = args.patientId ? String(args.patientId) : String(session.boundPatientId);
  if (patientId !== String(session.boundPatientId)) throw new AppError(403, 'FORBIDDEN', 'Communication status is limited to the confirmed patient');
  const filter: Record<string, unknown> = { clinicId: session.clinicId, patientId };
  if (args.referenceId) filter.referenceId = String(args.referenceId);
  const messages = await CommunicationMessageModel.find(filter).sort({ createdAt: -1 }).limit(10).select('purpose status referenceType referenceId timeline createdAt').lean();
  return { messages: messages.map((message) => ({ id: String(message._id), purpose: message.purpose, status: message.status, referenceType: message.referenceType, referenceId: message.referenceId ? String(message.referenceId) : undefined, createdAt: message.createdAt, timeline: message.timeline })) };
}

export async function executeTool(body: { sessionId: string; toolName: JarvisToolName; arguments: Record<string, unknown> }) {
  const session = await validSession(body.sessionId);
  const schema = toolArgumentSchemas[body.toolName];
  const args = schema.parse(body.arguments) as Record<string, unknown>;
  switch (body.toolName) {
    case 'lookup_patient': return lookupPatient(session, args);
    case 'propose_patient_binding': return proposePatientBinding(session, args);
    case 'get_patient_context': return patientContext(session);
    case 'get_queue_status': return queueStatus(session, args);
    case 'search_inventory': return searchInventory(session, args);
    case 'get_low_stock': return lowStock(session);
    case 'get_recent_prescriptions': return recentPrescriptions(session, args);
    case 'get_communication_status': return communicationStatus(session, args);
    case 'propose_prescription_draft': return proposePrescriptionDraft(session, args);
    default: throw new AppError(400, 'UNKNOWN_TOOL', 'Unknown Jarvis tool');
  }
}

export async function revokeSession(req: Request, sessionId: string) {
  const actor = requireDoctor(req);
  const session = await JarvisSessionModel.findOneAndUpdate(
    { sessionId, clinicId: actor.clinicId, doctorId: actor.userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  );
  if (!session) return { revoked: true };
  await JarvisActionModel.updateMany({ sessionId, status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
  await recordAudit({ req, clinicId: actor.clinicId, actorUserId: actor.userId, action: 'jarvis.session_revoked', targetType: 'JarvisSession', targetId: sessionId, metadata: {} });
  return { revoked: true };
}

export async function diagnostics(req: Request) {
  requireDoctor(req);
  let agentReachable = false;
  let agentReady = false;
  let providerConfigured = false;
  if (env.JARVIS_AGENT_URL) {
    try {
      const response = await fetch(`${env.JARVIS_AGENT_URL.replace(/\/$/, '')}/ready`, { signal: AbortSignal.timeout(2000) });
      agentReachable = true;
      const body = await response.json() as { providerConfigured?: boolean };
      agentReady = response.ok;
      providerConfigured = body.providerConfigured === true;
    } catch { /* safe diagnostic only */ }
  }
  return { enabled: env.JARVIS_ENABLED, agentReachable, agentReady, providerConfigured, internalToolContract: Boolean(env.JARVIS_INTERNAL_HMAC_SECRET), sessionSigning: Boolean(env.JARVIS_SESSION_JWT_SECRET) };
}
