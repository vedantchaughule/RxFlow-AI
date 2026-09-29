import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../shared/validation.js';

export const clinicSignupSchema = z.object({
  clinicName: z.string().trim().min(2).max(160),
  adminName: z.string().trim().min(2).max(160),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const tokenPasswordResetSchema = z.object({ token: z.string().min(32).max(256), newPassword: passwordSchema });
export const adminPasswordResetSchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i), temporaryPassword: passwordSchema });
export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: emailSchema,
  role: z.enum(['doctor', 'receptionist']),
  temporaryPassword: passwordSchema,
});
export const staffListQuerySchema = z.strictObject({
  search: z.string().trim().min(1).max(160).optional(),
  role: z.enum(['doctor', 'receptionist']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const mfaEnrollSchema = z.object({ friendlyName: z.string().trim().min(1).max(80).default('RxFlow authenticator') });
export const mfaChallengeSchema = z.object({});
export const mfaVerifySchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
export const supportRecoverySchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i), reason: z.string().trim().min(10).max(500) });
