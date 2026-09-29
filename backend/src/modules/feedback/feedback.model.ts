import { Schema, model, type InferSchemaType } from 'mongoose';

const feedbackSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true, immutable: true },
  appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, immutable: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, immutable: true },
  doctorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  tokenHash: { type: String, required: true, select: false },
  tokenExpiresAt: { type: Date, required: true },
  consentedAt: { type: Date },
  rating: { type: Number, min: 1, max: 5 },
  comment: { type: String, maxlength: 1000 },
  submittedAt: { type: Date, index: true },
  visibility: { type: String, enum: ['clinic_private'], default: 'clinic_private', immutable: true },
}, { timestamps: true });

feedbackSchema.index({ clinicId: 1, appointmentId: 1 }, { unique: true });
feedbackSchema.index({ tokenHash: 1 }, { unique: true });
feedbackSchema.index({ clinicId: 1, doctorId: 1, submittedAt: -1 });

export type Feedback = InferSchemaType<typeof feedbackSchema>;
export const FeedbackModel = model<Feedback>('Feedback', feedbackSchema);
