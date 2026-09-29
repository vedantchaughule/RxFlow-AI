import { Schema, model, type InferSchemaType } from 'mongoose';

const passwordResetTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  invalidatedAt: { type: Date },
}, { timestamps: true });

passwordResetTokenSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
passwordResetTokenSchema.index({ userId: 1, usedAt: 1, invalidatedAt: 1 });

export type PasswordResetToken = InferSchemaType<typeof passwordResetTokenSchema>;
export const PasswordResetTokenModel = model<PasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);
