import { Schema, model, type InferSchemaType } from 'mongoose';

export const communicationStatuses = ['queued', 'retry_scheduled', 'accepted', 'sandbox_recorded', 'sent', 'delivered', 'read', 'failed', 'replied', 'dead_letter'] as const;
const timelineEventSchema = new Schema({ status: { type: String, enum: communicationStatuses, required: true }, at: { type: Date, required: true }, safeCode: { type: String, maxlength: 120 } }, { _id: false });
const communicationMessageSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  direction: { type: String, enum: ['outbound', 'inbound'], required: true },
  purpose: { type: String, required: true, maxlength: 80 },
  channel: { type: String, enum: ['whatsapp'], default: 'whatsapp' },
  templateName: { type: String, maxlength: 512 },
  parameterValues: { type: Schema.Types.Mixed, select: false },
  status: { type: String, enum: communicationStatuses, required: true, index: true },
  providerMessageId: { type: String, select: false, index: true },
  replyText: { type: String, trim: true, maxlength: 500 },
  replyIntent: { type: String, enum: ['confirm', 'reschedule', 'cancel', 'other'] },
  referenceType: { type: String, enum: ['Appointment', 'Prescription'] },
  referenceId: { type: Schema.Types.ObjectId },
  timeline: { type: [timelineEventSchema], default: [] },
}, { timestamps: true });
communicationMessageSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });
communicationMessageSchema.index({ clinicId: 1, providerMessageId: 1 }, { unique: true, sparse: true });
export type CommunicationMessage = InferSchemaType<typeof communicationMessageSchema>;
export const CommunicationMessageModel = model<CommunicationMessage>('CommunicationMessage', communicationMessageSchema);
