import { Schema, model, type InferSchemaType } from 'mongoose';

const prescriptionShareLinkSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  prescriptionId: { type: Schema.Types.ObjectId, ref: 'Prescription', required: true, index: true },
  patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  tokenEncrypted: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: true },
  maxViews: { type: Number, required: true, default: 20 },
  viewCount: { type: Number, required: true, default: 0 },
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked', 'access_limit_reached'],
    default: 'active',
    index: true,
  },
  revokedAt: { type: Date },
}, { timestamps: true });

prescriptionShareLinkSchema.index({ clinicId: 1, prescriptionId: 1, createdAt: -1 });

export type PrescriptionShareLink = InferSchemaType<typeof prescriptionShareLinkSchema>;
export const PrescriptionShareLinkModel = model<PrescriptionShareLink>('PrescriptionShareLink', prescriptionShareLinkSchema);
