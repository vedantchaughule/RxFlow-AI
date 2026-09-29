import { Schema, model, type InferSchemaType } from 'mongoose';

const authSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  sessionId: { type: String, required: true, unique: true, index: true },
  refreshTokenHash: { type: String, required: true, select: false },
  mfaChallengeHash: { type: String, select: false },
  mfaChallengeExpiresAt: { type: Date },
  mfaVerifiedAt: { type: Date },
  issuedAt: { type: Date, required: true },
  lastActivityAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: true },
  revokedAt: { type: Date },
}, { timestamps: true });

authSessionSchema.index({ userId: 1, revokedAt: 1 });

export type AuthSession = InferSchemaType<typeof authSessionSchema>;
export const AuthSessionModel = model<AuthSession>('AuthSession', authSessionSchema);

