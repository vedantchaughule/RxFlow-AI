import { Schema, model, type InferSchemaType } from 'mongoose';

const jarvisSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  boundPatientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
  boundQueueEntryId: { type: Schema.Types.ObjectId, ref: 'VisitQueue' },
  tokenVersion: { type: Number, required: true, default: 1 },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  lastActivityAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });
jarvisSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
jarvisSessionSchema.index({ clinicId: 1, doctorId: 1, revokedAt: 1, expiresAt: 1 });

const jarvisActionSchema = new Schema({
  actionId: { type: String, required: true, unique: true, index: true },
  sessionId: { type: String, required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['confirm_patient_binding', 'review_prescription_draft'], required: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
  queueEntryId: { type: Schema.Types.ObjectId, ref: 'VisitQueue' },
  payload: { type: Schema.Types.Mixed, required: true },
  payloadHash: { type: String, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'expired'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true },
  confirmedAt: { type: Date },
  cancelledAt: { type: Date },
}, { timestamps: true });
jarvisActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
jarvisActionSchema.index({ sessionId: 1, status: 1, expiresAt: 1 });

export type JarvisSession = InferSchemaType<typeof jarvisSessionSchema>;
export type JarvisAction = InferSchemaType<typeof jarvisActionSchema>;
export const JarvisSessionModel = model<JarvisSession>('JarvisSession', jarvisSessionSchema);
export const JarvisActionModel = model<JarvisAction>('JarvisAction', jarvisActionSchema);
