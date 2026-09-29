import { Schema, model, type InferSchemaType } from 'mongoose';

const clinicLogoSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, unique: true, index: true },
  contentType: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp'], required: true },
  data: { type: Buffer, required: true, select: false },
  size: { type: Number, required: true, min: 1, max: 2 * 1024 * 1024 },
}, { timestamps: true });

export type ClinicLogo = InferSchemaType<typeof clinicLogoSchema>;
export const ClinicLogoModel = model<ClinicLogo>('ClinicLogo', clinicLogoSchema);
