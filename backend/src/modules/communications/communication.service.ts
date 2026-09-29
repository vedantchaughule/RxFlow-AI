import crypto from 'node:crypto';
import type { Request } from 'express';
import { decrypt, encrypt } from '../../shared/encryption.js';
import { AppError } from '../../shared/errors.js';
import { recordAudit } from '../audit/audit.service.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { ClinicModel } from '../clinics/clinic.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { PrescriptionModel } from '../prescriptions/prescription.model.js';
import { CloudWhatsAppAdapter } from './adapters/cloud-whatsapp.adapter.js';
import { SandboxWhatsAppAdapter } from './adapters/sandbox-whatsapp.adapter.js';
import { WhatsAppAdapterError, type WhatsAppAdapter } from './adapters/whatsapp-adapter.js';
import { CommunicationJobModel } from './communication-job.model.js';
import { CommunicationMessageModel } from './communication-message.model.js';
import { CommunicationTemplateModel } from './communication-template.model.js';
import { ReceptionAlertModel } from './reception-alert.model.js';
import type { AlertQuery, ConsentUpdate, TemplateCreate, TimelineQuery, WhatsappConfigUpdate } from './communication.schemas.js';

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
type Purpose = 'appointment_confirmation' | 'appointment_reminder_24h' | 'appointment_reminder_2h' | 'prescription_ready';

function authFor(req: Request) { if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required'); return req.auth; }
function publicWhatsapp(config: Record<string, unknown> | undefined) {
  const adapter = config?.adapter === 'cloud' ? 'cloud' : 'sandbox';
  return { adapter, label: adapter === 'cloud' ? 'WhatsApp Cloud API' : 'Development sandbox — no messages are delivered', apiVersion: config?.apiVersion ?? 'v26.0', phoneNumberId: config?.phoneNumberId, whatsappBusinessAccountId: config?.whatsappBusinessAccountId, webhookPath: config?.webhookKey ? `/api/v1/webhooks/whatsapp/${String(config.webhookKey)}` : undefined, isConfigured: config?.isConfigured === true };
}

export async function updateWhatsappConfig(req: Request, input: WhatsappConfigUpdate) {
  const auth = authFor(req);
  if (input.adapter === 'sandbox' && process.env.NODE_ENV === 'production') throw new AppError(400, 'SANDBOX_NOT_ALLOWED', 'The development sandbox cannot be enabled in production');
  const existing = await ClinicModel.findOne({ _id: auth.clinicId, status: 'active' }).select('+whatsappConfig.encryptedAccessToken +whatsappConfig.encryptedAppSecret +whatsappConfig.encryptedVerifyToken').lean();
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  const webhookKey = input.webhookKey ?? crypto.randomBytes(32).toString('base64url');
  const config = input.adapter === 'sandbox' ? { adapter: 'sandbox', apiVersion: input.apiVersion, webhookKey, isConfigured: true } : {
    adapter: 'cloud', apiVersion: input.apiVersion, phoneNumberId: input.phoneNumberId, whatsappBusinessAccountId: input.whatsappBusinessAccountId,
    encryptedAccessToken: encrypt(input.accessToken!), encryptedAppSecret: encrypt(input.appSecret!), encryptedVerifyToken: encrypt(input.verifyToken!), webhookKey, isConfigured: true,
  };
  const clinic = await ClinicModel.findOneAndUpdate({ _id: auth.clinicId, status: 'active' }, { $set: { whatsappConfig: config } }, { returnDocument: 'after', runValidators: true }).select('whatsappConfig').lean();
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'clinic.whatsapp_config_updated', targetType: 'Clinic', targetId: auth.clinicId, metadata: { adapter: input.adapter, apiVersion: input.apiVersion } });
  return publicWhatsapp(clinic.whatsappConfig as unknown as Record<string, unknown>);
}

export async function updatePatientConsent(req: Request, patientId: string, input: ConsentUpdate) {
  const auth = authFor(req); const now = new Date();
  const patient = await PatientModel.findOneAndUpdate({ _id: patientId, clinicId: auth.clinicId, isDeleted: false }, { $set: { communicationConsent: { ...input, capturedAt: now, capturedById: auth.userId } } }, { returnDocument: 'after', runValidators: true }).select('communicationConsent').lean();
  if (!patient) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  if (input.status === 'opted_out') await CommunicationJobModel.updateMany({ clinicId: auth.clinicId, status: 'pending', messageId: { $in: await CommunicationMessageModel.find({ clinicId: auth.clinicId, patientId }).distinct('_id') } }, { $set: { status: 'cancelled' } });
  await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'patient.communication_consent_updated', targetType: 'Patient', targetId: patientId, metadata: { status: input.status, source: input.source, categories: input.categories } });
  return patient.communicationConsent;
}

export async function createTemplate(req: Request, input: TemplateCreate) {
  const auth = authFor(req);
  if (input.status !== 'APPROVED') throw new AppError(400, 'TEMPLATE_NOT_APPROVED', 'Only templates currently approved by Meta can be activated');
  try {
    const template = await CommunicationTemplateModel.create({ clinicId: auth.clinicId, ...input });
    await recordAudit({ req, clinicId: auth.clinicId, actorUserId: auth.userId, action: 'communication.template_registered', targetType: 'CommunicationTemplate', targetId: String(template._id), metadata: { name: input.name, language: input.language, purpose: input.purpose, status: input.status } });
    return template.toObject();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new AppError(409, 'CONFLICT', 'A template is already registered for this purpose');
    throw error;
  }
}

function categoryFor(purpose: Purpose): 'appointments' | 'prescription_ready' { return purpose === 'prescription_ready' ? 'prescription_ready' : 'appointments'; }
export async function queueCommunication(input: { clinicId: string; patientId: string; purpose: Purpose; runAt: Date; dedupeKey: string; referenceType: 'Appointment' | 'Prescription'; referenceId: string; parameters: Record<string, string> }) {
  const [patient, clinic, template] = await Promise.all([
    PatientModel.findOne({ _id: input.patientId, clinicId: input.clinicId, isDeleted: false }).select('communicationConsent').lean(),
    ClinicModel.findOne({ _id: input.clinicId, status: 'active' }).select('whatsappConfig').lean(),
    CommunicationTemplateModel.findOne({ clinicId: input.clinicId, purpose: input.purpose, status: 'APPROVED' }).lean(),
  ]);
  if (!patient?.communicationConsent || patient.communicationConsent.status !== 'opted_in' || !patient.communicationConsent.categories.includes(categoryFor(input.purpose))) return { queued: false, reason: 'CONSENT_REQUIRED' } as const;
  if (!clinic?.whatsappConfig?.isConfigured) return { queued: false, reason: 'WHATSAPP_NOT_CONFIGURED' } as const;
  if (!template) return { queued: false, reason: 'APPROVED_TEMPLATE_REQUIRED' } as const;
  const message = await CommunicationMessageModel.create({
    clinicId: input.clinicId,
    patientId: input.patientId,
    direction: 'outbound',
    purpose: input.purpose,
    templateName: template.name,
    parameterValues: input.parameters,
    status: 'queued',
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    timeline: [{ status: 'queued', at: new Date() }],
  });
  try {
    await CommunicationJobModel.create({ clinicId: input.clinicId, messageId: message._id, dedupeKey: input.dedupeKey, runAt: input.runAt });
  } catch (error) {
    await CommunicationMessageModel.deleteOne({ _id: message._id, clinicId: input.clinicId });
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return { queued: false, reason: 'ALREADY_QUEUED' } as const;
    throw error;
  }
  return { queued: true, messageId: String(message._id) } as const;
}

export async function queueCommunicationSafely(input: Parameters<typeof queueCommunication>[0]) {
  try { return await queueCommunication(input); }
  catch { return { queued: false, reason: 'COMMUNICATION_QUEUE_UNAVAILABLE' } as const; }
}

async function assertReferenceCanSend(message: { clinicId: string; referenceType?: 'Appointment' | 'Prescription' | null; referenceId?: unknown }) {
  if (!message.referenceType || !message.referenceId) return;
  if (message.referenceType === 'Appointment') {
    const appointment = await AppointmentModel.findOne({ _id: String(message.referenceId), clinicId: message.clinicId }).select('status').lean();
    if (!appointment) throw new WhatsAppAdapterError('REFERENCE_NOT_FOUND', false);
    if (['cancelled', 'completed', 'no_show'].includes(appointment.status)) throw new WhatsAppAdapterError('REFERENCE_INACTIVE', false);
    return;
  }
  if (message.referenceType === 'Prescription') {
    const exists = await PrescriptionModel.exists({ _id: String(message.referenceId), clinicId: message.clinicId });
    if (!exists) throw new WhatsAppAdapterError('REFERENCE_NOT_FOUND', false);
  }
}

async function adapterFor(clinicId: string): Promise<{ adapter: WhatsAppAdapter; config: Record<string, unknown> }> {
  const clinic = await ClinicModel.findById(clinicId).select('+whatsappConfig.encryptedAccessToken +whatsappConfig.encryptedAppSecret +whatsappConfig.encryptedVerifyToken').lean();
  const config = clinic?.whatsappConfig as unknown as Record<string, unknown> | undefined;
  if (!config?.isConfigured) throw new WhatsAppAdapterError('WHATSAPP_NOT_CONFIGURED', false);
  if (config.adapter === 'sandbox') return { adapter: new SandboxWhatsAppAdapter(), config };
  return { adapter: new CloudWhatsAppAdapter({ apiVersion: String(config.apiVersion), phoneNumberId: String(config.phoneNumberId), accessToken: decrypt(String(config.encryptedAccessToken)) }), config };
}

export async function processDueCommunicationJobs(now = new Date(), limit = 25): Promise<number> {
  let processed = 0;
  for (; processed < limit; processed += 1) {
    const job = await CommunicationJobModel.findOneAndUpdate(
      {
        runAt: { $lte: now },
        $or: [
          { status: 'pending', $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }] },
          { status: 'processing', lockedUntil: { $lt: now } },
        ],
      },
      { $set: { status: 'processing', lockedUntil: new Date(now.getTime() + 60_000) }, $inc: { attempts: 1 } },
      { sort: { runAt: 1 }, returnDocument: 'after' },
    );
    if (!job) break;
    const message = await CommunicationMessageModel.findOne({ _id: job.messageId, clinicId: job.clinicId }).select('+parameterValues');
    try {
      if (!message) throw new WhatsAppAdapterError('MESSAGE_NOT_FOUND', false);
      await assertReferenceCanSend({ clinicId: String(message.clinicId), referenceType: message.referenceType, referenceId: message.referenceId });
      const patient = await PatientModel.findOne({ _id: message.patientId, clinicId: job.clinicId, isDeleted: false }).select('phone communicationConsent').lean();
      if (!patient?.communicationConsent || patient.communicationConsent.status !== 'opted_in' || !patient.communicationConsent.categories.includes(categoryFor(message.purpose as Purpose))) throw new WhatsAppAdapterError('CONSENT_REQUIRED', false);
      const template = await CommunicationTemplateModel.findOne({ clinicId: job.clinicId, purpose: message.purpose, status: 'APPROVED' } as never).lean();
      if (!template) throw new WhatsAppAdapterError('APPROVED_TEMPLATE_REQUIRED', false);
      const { adapter } = await adapterFor(String(job.clinicId));
      const result = await adapter.sendTemplate({ to: patient.phone, template: { name: template.name, language: template.language, parameterFormat: template.parameterFormat }, parameters: ((message.toObject() as unknown as Record<string, unknown>).parameterValues as Record<string, string> | undefined) ?? {} });
      await CommunicationMessageModel.updateOne({ _id: message._id, clinicId: job.clinicId }, { $set: { status: result.status, ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}) }, $push: { timeline: { status: result.status, at: now } } });
      await CommunicationJobModel.updateOne({ _id: job._id }, { $set: { status: 'completed' }, $unset: { lockedUntil: 1, failureCode: 1 } });
    } catch (error) {
      const known = error instanceof WhatsAppAdapterError ? error : new WhatsAppAdapterError('WHATSAPP_SEND_FAILED', true);
      const retry = known.retryable && job.attempts < job.maxAttempts;
      if (retry) {
        const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)]!;
        await CommunicationJobModel.updateOne({ _id: job._id }, { $set: { status: 'pending', runAt: new Date(now.getTime() + delay), failureCode: known.safeCode }, $unset: { lockedUntil: 1 } });
        if (message) await CommunicationMessageModel.updateOne({ _id: message._id }, { $set: { status: 'retry_scheduled' }, $push: { timeline: { status: 'retry_scheduled', at: now, safeCode: known.safeCode } } });
      } else {
        await CommunicationJobModel.updateOne({ _id: job._id }, { $set: { status: 'dead_letter', failureCode: known.safeCode }, $unset: { lockedUntil: 1 } });
        if (message) {
          await CommunicationMessageModel.updateOne({ _id: message._id }, { $set: { status: 'dead_letter' }, $push: { timeline: { status: 'dead_letter', at: now, safeCode: known.safeCode } } });
          await ReceptionAlertModel.updateOne({ clinicId: job.clinicId, messageId: message._id, type: 'dead_letter' }, { $setOnInsert: { patientId: message.patientId, summary: 'WhatsApp notification needs reception follow-up' } }, { upsert: true });
        }
      }
    }
  }
  return processed;
}

export async function listTimeline(req: Request, patientId: string, query: TimelineQuery) {
  const auth = authFor(req);
  if (!await PatientModel.exists({ _id: patientId, clinicId: auth.clinicId, isDeleted: false })) throw new AppError(404, 'NOT_FOUND', 'Patient not found');
  const filter = { clinicId: auth.clinicId, patientId }; const skip = (query.page - 1) * query.limit;
  const [messages, total, clinic] = await Promise.all([CommunicationMessageModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).select('-__v').lean(), CommunicationMessageModel.countDocuments(filter), ClinicModel.findById(auth.clinicId).select('whatsappConfig').lean()]);
  return { messages, adapter: publicWhatsapp(clinic?.whatsappConfig as unknown as Record<string, unknown>), pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

export async function listAlerts(req: Request, query: AlertQuery) {
  const auth = authFor(req); const filter = { clinicId: auth.clinicId, ...(query.unreadOnly ? { readAt: { $exists: false } } : {}) }; const skip = (query.page - 1) * query.limit;
  const [alerts, total] = await Promise.all([ReceptionAlertModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(), ReceptionAlertModel.countDocuments(filter)]);
  return { alerts, pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

export async function cancelReferenceJobs(clinicId: string, referenceId: string) {
  const messageIds = await CommunicationMessageModel.find({ clinicId, referenceId }).distinct('_id');
  await CommunicationJobModel.updateMany({ clinicId, messageId: { $in: messageIds }, status: { $in: ['pending', 'processing'] } }, { $set: { status: 'cancelled' }, $unset: { lockedUntil: 1 } });
}
