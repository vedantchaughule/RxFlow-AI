import { Schema, model, type InferSchemaType } from 'mongoose';

export const communicationPurposes = ['appointment_confirmation', 'appointment_reminder_24h', 'appointment_reminder_2h', 'prescription_ready'] as const;
const communicationTemplateSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 512, match: /^[a-z0-9_]+$/ },
  language: { type: String, required: true, trim: true, maxlength: 20 },
  category: { type: String, enum: ['utility'], required: true },
  purpose: { type: String, enum: communicationPurposes, required: true },
  status: { type: String, enum: ['APPROVED', 'PAUSED', 'DISABLED', 'REJECTED', 'PENDING'], required: true },
  parameterFormat: { type: String, enum: ['named', 'positional'], default: 'named' },
  parameterNames: { type: [String], default: [] },
}, { timestamps: true });
communicationTemplateSchema.index({ clinicId: 1, purpose: 1 }, { unique: true });
communicationTemplateSchema.index({ clinicId: 1, name: 1, language: 1 }, { unique: true });
export type CommunicationTemplate = InferSchemaType<typeof communicationTemplateSchema>;
export const CommunicationTemplateModel = model<CommunicationTemplate>('CommunicationTemplate', communicationTemplateSchema);
