import crypto from 'node:crypto';
import { decrypt } from '../../shared/encryption.js';
import { AppointmentModel } from '../appointments/appointment.model.js';
import { ClinicModel } from '../clinics/clinic.model.js';
import { PatientModel } from '../patients/patient.model.js';
import { CommunicationMessageModel } from './communication-message.model.js';
import { ReceptionAlertModel } from './reception-alert.model.js';
import { WebhookEventModel } from './webhook-event.model.js';

type WebhookValue = {
  metadata?: { phone_number_id?: string };
  statuses?: Array<{ id?: string; status?: string; timestamp?: string; errors?: Array<{ code?: number }> }>;
  messages?: Array<{ from?: string; id?: string; timestamp?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }>;
};
type WebhookPayload = { object?: string; entry?: Array<{ changes?: Array<{ field?: string; value?: WebhookValue }> }> };

export async function findWebhookClinic(webhookKey: string) {
  return ClinicModel.findOne({ 'whatsappConfig.webhookKey': webhookKey, 'whatsappConfig.isConfigured': true, status: 'active' }).select('+whatsappConfig.encryptedAppSecret +whatsappConfig.encryptedVerifyToken').lean();
}

export function verifySignature(rawBody: Buffer, signatureHeader: string | undefined, encryptedAppSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const received = Buffer.from(signatureHeader.slice(7), 'hex');
  const expected = crypto.createHmac('sha256', decrypt(encryptedAppSecret)).update(rawBody).digest();
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function verifyChallengeToken(received: string, encryptedVerifyToken: string): boolean {
  const actual = Buffer.from(received); const expected = Buffer.from(decrypt(encryptedVerifyToken));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function eventKey(kind: string, id: string, status: string | undefined, timestamp: string | undefined) { return crypto.createHash('sha256').update(`${kind}:${id}:${status ?? ''}:${timestamp ?? ''}`).digest('hex'); }
function normalizePhone(value: string) { return `+${value.replace(/\D/g, '')}`; }
function inboundText(message: NonNullable<WebhookValue['messages']>[number]): string { return (message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? '').trim().slice(0, 500); }
function intentFor(text: string): 'confirm' | 'reschedule' | 'cancel' | 'other' { const normalized = text.trim().toUpperCase(); if (normalized === 'CONFIRM') return 'confirm'; if (normalized === 'RESCHEDULE') return 'reschedule'; if (normalized === 'CANCEL') return 'cancel'; return 'other'; }

async function acquireEvent(clinicId: string, key: string, kind: 'status' | 'message') {
  try { return await WebhookEventModel.create({ clinicId, eventKey: key, kind }); }
  catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return null; throw error; }
}

async function processStatus(clinicId: string, status: NonNullable<WebhookValue['statuses']>[number]) {
  if (!status.id || !['sent', 'delivered', 'read', 'failed'].includes(status.status ?? '')) return;
  const event = await acquireEvent(clinicId, eventKey('status', status.id, status.status, status.timestamp), 'status'); if (!event) return;
  try {
    const message = await CommunicationMessageModel.findOne({ clinicId, providerMessageId: status.id }).select('+providerMessageId');
    if (message) {
      const next = status.status as 'sent' | 'delivered' | 'read' | 'failed'; const ranks: Record<string, number> = { queued: 0, retry_scheduled: 0, accepted: 1, sent: 2, delivered: 3, read: 4 };
      if (next === 'failed' || (ranks[next] ?? 0) >= (ranks[message.status] ?? 0)) {
        const at = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
        message.status = next; message.timeline.push({ status: next, at, ...(next === 'failed' && status.errors?.[0]?.code ? { safeCode: `META_${status.errors[0].code}` } : {}) }); await message.save();
        if (next === 'failed') await ReceptionAlertModel.updateOne({ clinicId, messageId: message._id, type: 'delivery_failure' }, { $setOnInsert: { patientId: message.patientId, summary: 'WhatsApp delivery failed; contact the patient another way' } }, { upsert: true });
      }
    }
    event.processedAt = new Date(); await event.save();
  } catch (error) { await WebhookEventModel.deleteOne({ _id: event._id }); throw error; }
}

async function processInbound(clinicId: string, incoming: NonNullable<WebhookValue['messages']>[number]) {
  if (!incoming.id || !incoming.from) return;
  const event = await acquireEvent(clinicId, eventKey('message', incoming.id, incoming.type, incoming.timestamp), 'message'); if (!event) return;
  try {
    const patient = await PatientModel.findOne({ clinicId, phone: normalizePhone(incoming.from), isDeleted: false }).select('_id').lean();
    if (patient) {
      const replyText = inboundText(incoming); const replyIntent = intentFor(replyText);
      const parent = await CommunicationMessageModel.findOne({ clinicId, patientId: patient._id, direction: 'outbound' }).sort({ createdAt: -1 }).lean();
      const message = await CommunicationMessageModel.create({ clinicId, patientId: patient._id, direction: 'inbound', purpose: 'patient_reply', status: 'replied', replyText: replyText || '[Unsupported reply type]', replyIntent, ...(parent?.referenceType ? { referenceType: parent.referenceType, referenceId: parent.referenceId } : {}), timeline: [{ status: 'replied', at: incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000) : new Date() }] });
      if (parent?.referenceType === 'Appointment' && parent.referenceId) {
        if (replyIntent === 'confirm') await AppointmentModel.updateOne({ _id: parent.referenceId, clinicId, status: { $in: ['pending', 'rescheduled'] } }, { $set: { status: 'confirmed' } });
        if (replyIntent === 'cancel') await AppointmentModel.updateOne({ _id: parent.referenceId, clinicId, status: { $in: ['pending', 'confirmed', 'rescheduled'] } }, { $set: { status: 'cancelled' } });
      }
      await ReceptionAlertModel.create({ clinicId, patientId: patient._id, messageId: message._id, type: 'patient_reply', summary: replyIntent === 'other' ? 'Patient sent a WhatsApp reply' : `Patient replied ${replyIntent.toUpperCase()}` });
    }
    event.processedAt = new Date(); await event.save();
  } catch (error) { await WebhookEventModel.deleteOne({ _id: event._id }); throw error; }
}

export async function processWebhookPayload(clinicId: string, payload: WebhookPayload) {
  if (payload.object !== 'whatsapp_business_account') return;
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    if (change.field !== 'messages') continue;
    for (const status of change.value?.statuses ?? []) await processStatus(clinicId, status);
    for (const message of change.value?.messages ?? []) await processInbound(clinicId, message);
  }
}
