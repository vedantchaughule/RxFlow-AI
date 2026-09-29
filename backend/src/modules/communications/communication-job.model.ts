import { Schema, model, type InferSchemaType } from 'mongoose';

const communicationJobSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  messageId: { type: Schema.Types.ObjectId, ref: 'CommunicationMessage', required: true, unique: true },
  dedupeKey: { type: String, required: true },
  runAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'dead_letter', 'cancelled'], default: 'pending', index: true },
  attempts: { type: Number, min: 0, default: 0 },
  maxAttempts: { type: Number, min: 1, max: 10, default: 4 },
  lockedUntil: { type: Date },
  failureCode: { type: String, maxlength: 120 },
}, { timestamps: true });
communicationJobSchema.index({ clinicId: 1, dedupeKey: 1 }, { unique: true });
communicationJobSchema.index({ status: 1, runAt: 1, lockedUntil: 1 });
export type CommunicationJob = InferSchemaType<typeof communicationJobSchema>;
export const CommunicationJobModel = model<CommunicationJob>('CommunicationJob', communicationJobSchema);
