import { Schema, model, type InferSchemaType } from 'mongoose';
const receptionAlertSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
  messageId: { type: Schema.Types.ObjectId, ref: 'CommunicationMessage', required: true },
  type: { type: String, enum: ['patient_reply', 'delivery_failure', 'dead_letter'], required: true },
  summary: { type: String, required: true, maxlength: 200 },
  readAt: { type: Date },
}, { timestamps: true });
receptionAlertSchema.index({ clinicId: 1, createdAt: -1 });
receptionAlertSchema.index({ clinicId: 1, messageId: 1, type: 1 }, { unique: true });
export type ReceptionAlert = InferSchemaType<typeof receptionAlertSchema>;
export const ReceptionAlertModel = model<ReceptionAlert>('ReceptionAlert', receptionAlertSchema);
