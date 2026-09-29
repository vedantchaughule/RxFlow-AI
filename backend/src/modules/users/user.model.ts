import { Schema, model, type InferSchemaType } from 'mongoose';

export const userRoles = ['admin', 'doctor', 'receptionist'] as const;
export type UserRole = typeof userRoles[number];

const userSchema = new Schema({
  clinicId: { type: Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  role: { type: String, enum: userRoles, required: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  mustChangePassword: { type: Boolean, default: false },
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: { type: Date },
  sessionInvalidBefore: { type: Date },
  sessionVersion: { type: Number, default: 1 },
  mfaRequired: { type: Boolean, default: false },
  mfaEnrolled: { type: Boolean, default: false },
  mfaSecretEncrypted: { type: String, select: false },
  mfaRecoveryCodesHash: { type: [String], default: [], select: false },
  lastLoginAt: { type: Date },
}, { timestamps: true });

userSchema.index({ clinicId: 1, email: 1 }, { unique: true });

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model<User>('User', userSchema);

