import { Router } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { requireAdminMfa, requireAuth, requirePasswordReady, requireRole } from '../../middleware/auth.js';
import { clearRefreshCookie, setRefreshCookie } from '../../shared/security.js';
import { AppError } from '../../shared/errors.js';
import { env } from '../../config/env.js';
import { UserModel } from '../users/user.model.js';
import * as schemas from './auth.schemas.js';
import * as service from './auth.service.js';
import { objectIdSchema } from '../../shared/validation.js';

const router = Router();
const rateLimitMessage = { success: false, error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts' } };
const emailKeyGenerator: Options['keyGenerator'] = (req) => {
  const ip = req.ip ?? 'unknown';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'anonymous';
  return `${ip}:${email}`;
};
const loginLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: rateLimitMessage, keyGenerator: emailKeyGenerator, validate: { keyGeneratorIpFallback: false } });
const sessionLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: rateLimitMessage });
const signupLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: rateLimitMessage, keyGenerator: emailKeyGenerator, validate: { keyGeneratorIpFallback: false } });
const staffUserParamsSchema = z.object({ userId: objectIdSchema });

function authResponse(session: { accessToken: string; expiresIn: number; mfaVerified: boolean }, extra: Record<string, unknown> = {}) {
  return { success: true, data: { accessToken: session.accessToken, expiresIn: session.expiresIn, mfaVerified: session.mfaVerified, ...extra } };
}

router.post('/clinic-signup', signupLimiter, validateBody(schemas.clinicSignupSchema), asyncHandler(async (req, res) => {
  const session = await service.signup(req, req.body);
  setRefreshCookie(res, session.refreshToken);
  res.status(201).json(authResponse(session, { role: 'admin', mustChangePassword: false }));
}));

router.post('/login', loginLimiter, validateBody(schemas.loginSchema), asyncHandler(async (req, res) => {
  const session = await service.login(req, req.body.email, req.body.password);
  setRefreshCookie(res, session.refreshToken);
  res.json(authResponse(session, { role: session.role, mustChangePassword: session.mustChangePassword, mfaRequired: session.mfaRequired, mfaEnrolled: session.mfaEnrolled }));
}));

router.post('/refresh', sessionLimiter, asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.AUTH_COOKIE_NAME] as string | undefined;
  if (!token) throw new AppError(401, 'SESSION_EXPIRED', 'Session expired');
  const session = await service.refresh(token);
  setRefreshCookie(res, session.refreshToken);
  res.json(authResponse(session));
}));

router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  await service.logout(req);
  clearRefreshCookie(res);
  res.json({ success: true, data: { loggedOut: true } });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.auth?.userId).select('-__v').lean();
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  res.json({ success: true, data: { user, mfaVerified: req.auth?.mfaVerified ?? false } });
}));

router.post('/password/change', requireAuth, validateBody(schemas.passwordChangeSchema), asyncHandler(async (req, res) => {
  await service.changePassword(req, req.body.currentPassword, req.body.newPassword);
  clearRefreshCookie(res);
  res.json({ success: true, data: { passwordChanged: true, requiresLogin: true } });
}));

router.post('/password/complete-first-sign-in', requireAuth, validateBody(z.object({ newPassword: schemas.passwordChangeSchema.shape.newPassword })), asyncHandler(async (req, res) => {
  await service.completeFirstSignInPasswordChange(req, req.body.newPassword);
  clearRefreshCookie(res);
  res.json({ success: true, data: { passwordChanged: true, requiresLogin: true } });
}));

router.post('/password/forgot', signupLimiter, validateBody(schemas.forgotPasswordSchema), asyncHandler(async (req, res) => {
  const result = await service.requestPasswordReset(req, req.body.email);
  res.status(202).json({ success: true, data: { accepted: true, ...result } });
}));

router.post('/password/reset', sessionLimiter, validateBody(schemas.tokenPasswordResetSchema), asyncHandler(async (req, res) => {
  const result = await service.completePasswordReset(req, req.body.token, req.body.newPassword);
  clearRefreshCookie(res);
  res.json({ success: true, data: { passwordReset: true, loginPath: result.loginPath } });
}));

router.post('/mfa/enroll', requireAuth, validateBody(schemas.mfaEnrollSchema), asyncHandler(async (req, res) => {
  const factor = await service.enrollMfa(req, req.body.friendlyName);
  res.json({ success: true, data: factor });
}));

router.post('/mfa/challenge', requireAuth, validateBody(schemas.mfaChallengeSchema), asyncHandler(async (req, res) => {
  const challengeId = await service.createMfaChallenge(req);
  res.json({ success: true, data: { challengeId } });
}));

router.post('/mfa/verify', requireAuth, validateBody(schemas.mfaVerifySchema), asyncHandler(async (req, res) => {
  const { tokens, recoveryCodes } = await service.verifyMfa(req, req.body.challengeId, req.body.code);
  setRefreshCookie(res, tokens.refreshToken);
  res.json(authResponse(tokens, { recoveryCodes }));
}));

router.post('/mfa/recover', validateBody(schemas.supportRecoverySchema), asyncHandler(async (req, res) => {
  await service.recoverAdminMfa(req, req.body.userId, req.body.reason, req.header('x-platform-support-key') ?? '');
  res.json({ success: true, data: { recovered: true } });
}));

router.post('/staff', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateBody(schemas.staffCreateSchema), asyncHandler(async (req, res) => {
  await service.createStaff(req, req.body);
  res.status(201).json({ success: true, data: { created: true } });
}));

router.get('/staff', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateQuery(schemas.staffListQuerySchema), asyncHandler(async (req, res) => {
  const result = await service.listStaff(req, req.validatedQuery as never);
  res.json({ success: true, data: { staff: result.staff }, pagination: result.pagination });
}));

router.get('/doctors', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin', 'doctor', 'receptionist'), asyncHandler(async (req, res) => {
  const doctors = await service.listActiveDoctors(req);
  res.json({ success: true, data: { doctors } });
}));

router.post('/staff/:userId/disable', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateParams(staffUserParamsSchema), asyncHandler(async (req, res) => {
  await service.setStaffStatus(req, String(req.params.userId), 'disabled');
  res.json({ success: true, data: { disabled: true } });
}));

router.post('/staff/:userId/enable', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateParams(staffUserParamsSchema), asyncHandler(async (req, res) => {
  await service.setStaffStatus(req, String(req.params.userId), 'active');
  res.json({ success: true, data: { enabled: true } });
}));

router.post('/staff/:userId/reset-password', requireAuth, requirePasswordReady, requireAdminMfa, requireRole('admin'), validateParams(staffUserParamsSchema), validateBody(z.object({ temporaryPassword: schemas.passwordChangeSchema.shape.newPassword })), asyncHandler(async (req, res) => {
  await service.resetStaffPassword(req, String(req.params.userId), req.body.temporaryPassword);
  res.json({ success: true, data: { reset: true } });
}));

export default router;


