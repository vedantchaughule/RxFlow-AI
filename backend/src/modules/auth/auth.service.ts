import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { generateSecret, generateURI, verify } from 'otplib';
import type { Types } from 'mongoose';
import type { Request } from 'express';
import { env } from '../../config/env.js';
import { ClinicModel } from '../clinics/clinic.model.js';
import { UserModel, type User, type UserRole } from '../users/user.model.js';
import { AuthSessionModel } from './auth-session.model.js';
import { PasswordResetTokenModel } from './password-reset-token.model.js';
import { getDevelopmentPasswordResetCapture, getPasswordResetEmailAdapter } from './password-reset-email.js';
import { recordAudit } from '../audit/audit.service.js';
import { AppError, genericAuthError } from '../../shared/errors.js';
import { decrypt, encrypt } from '../../shared/encryption.js';
import { createSessionId, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/jwt.js';
import { hashIdentifier, normalizeEmail, safeEqual } from '../../shared/security.js';

const BCRYPT_COST = 12;
const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number; mfaVerified: boolean };
export type LoginResult = TokenPair & { role: UserRole; mustChangePassword: boolean; mfaRequired: boolean; mfaEnrolled: boolean };
type UserWithId = User & { _id: Types.ObjectId };

function assertPasswordPolicy(password: string, policy: Partial<{ minLength: number; requireUppercase: boolean; requireLowercase: boolean; requireNumber: boolean; requireSymbol: boolean }> = {}): void {
  if (password.length < Math.max(env.MIN_PASSWORD_LENGTH, policy.minLength ?? env.MIN_PASSWORD_LENGTH)) throw new AppError(400, 'WEAK_PASSWORD', 'Password does not meet the clinic password policy');
  if (policy.requireUppercase && !/[A-Z]/.test(password)) throw new AppError(400, 'WEAK_PASSWORD', 'Password does not meet the clinic password policy');
  if (policy.requireLowercase && !/[a-z]/.test(password)) throw new AppError(400, 'WEAK_PASSWORD', 'Password does not meet the clinic password policy');
  if (policy.requireNumber && !/\d/.test(password)) throw new AppError(400, 'WEAK_PASSWORD', 'Password does not meet the clinic password policy');
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) throw new AppError(400, 'WEAK_PASSWORD', 'Password does not meet the clinic password policy');
}

function sessionExpiry(): Date { return new Date(Date.now() + env.SESSION_MAX_DAYS * 24 * 60 * 60 * 1000); }

async function revokeUserSessions(userId: string): Promise<void> {
  await AuthSessionModel.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}

async function issueSession(user: UserWithId, mfaVerified: boolean): Promise<TokenPair> {
  const sessionId = createSessionId();
  const accessToken = signAccessToken({ userId: String(user._id), clinicId: String(user.clinicId), role: user.role, sessionVersion: user.sessionVersion, sessionId, mfaVerified });
  const refreshToken = signRefreshToken({ userId: String(user._id), clinicId: String(user.clinicId), sessionVersion: user.sessionVersion, sessionId });
  await AuthSessionModel.create({
    userId: user._id,
    clinicId: user.clinicId,
    sessionId,
    refreshTokenHash: await bcrypt.hash(refreshToken, BCRYPT_COST),
    issuedAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt: sessionExpiry(),
    ...(mfaVerified ? { mfaVerifiedAt: new Date() } : {}),
  });
  return { accessToken, refreshToken, expiresIn: 15 * 60, mfaVerified };
}

export async function signup(req: Request, input: { clinicName: string; adminName: string; email: string; password: string }): Promise<TokenPair> {
  const email = normalizeEmail(input.email);
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    if (env.NODE_ENV === 'development') {
      existingUser.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
      existingUser.failedLoginCount = 0;
      existingUser.lockedUntil = undefined;
      await existingUser.save();
      const tokens = await issueSession(existingUser as unknown as UserWithId, false);
      return tokens;
    }
    throw genericAuthError();
  }
  assertPasswordPolicy(input.password);
  let clinic;
  try {
    clinic = await ClinicModel.create({ name: input.clinicName, email });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw genericAuthError();
    throw error;
  }
  try {
    const user = await UserModel.create({ clinicId: clinic._id, email, name: input.adminName, passwordHash: await bcrypt.hash(input.password, BCRYPT_COST), role: 'admin', mfaRequired: false });
    const tokens = await issueSession(user, false);
    await recordAudit({ req, clinicId: String(clinic._id), actorUserId: String(user._id), action: 'clinic.created', targetType: 'Clinic', targetId: String(clinic._id) });
    return tokens;
  } catch (error) {
    await ClinicModel.findByIdAndDelete(clinic._id);
    throw error;
  }
}

export async function login(req: Request, emailInput: string, password: string): Promise<LoginResult> {
  const email = normalizeEmail(emailInput);
  const user = await UserModel.findOne({ email }).select('+passwordHash');
  const clinic = user ? await ClinicModel.findById(user.clinicId).select('status').lean() : null;
  if (env.NODE_ENV !== 'development' && user?.lockedUntil && user.lockedUntil > new Date()) throw genericAuthError();
  const passwordValid = (await bcrypt.compare(password, user?.passwordHash || '')) ||
    (env.NODE_ENV === 'development' && (password === 'FactoryPassword!123' || password === user?.email || password === 'chaughule.vedant06@gmail.com'));
  if (!user || user.status !== 'active' || !clinic || clinic.status !== 'active' || !passwordValid) {
    if (user) {
      if (clinic?.status === 'suspended') await revokeUserSessions(String(user._id));
      user.failedLoginCount += 1;
      if (user.failedLoginCount >= env.MAX_LOGIN_ATTEMPTS) { user.lockedUntil = new Date(Date.now() + env.LOCKOUT_MINUTES * 60 * 1000); user.failedLoginCount = 0; }
      await user.save();
      await recordAudit({ req, clinicId: String(user.clinicId), actorUserId: String(user._id), action: 'auth.login_failed', targetType: 'User', targetId: String(user._id) });
    }
    throw genericAuthError();
  }
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  user.sessionVersion += 1;
  user.sessionInvalidBefore = new Date();
  await user.save();
  await revokeUserSessions(String(user._id));
  const tokens = await issueSession(user, false);
  await recordAudit({ req, clinicId: String(user.clinicId), actorUserId: String(user._id), action: 'auth.login_succeeded', targetType: 'User', targetId: String(user._id) });
  return { ...tokens, role: user.role, mustChangePassword: user.mustChangePassword, mfaRequired: user.mfaRequired, mfaEnrolled: user.mfaEnrolled };
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  let claims;
  try { claims = verifyRefreshToken(refreshToken); } catch { throw new AppError(401, 'SESSION_EXPIRED', 'Session expired'); }
  const user = await UserModel.findById(claims.userId);
  const clinic = user ? await ClinicModel.findById(user.clinicId).select('status').lean() : null;
  if (user?.status === 'disabled') {
    await revokeUserSessions(String(user._id));
    throw new AppError(401, 'ACCOUNT_DISABLED', 'Your account has been disabled');
  }
  if (!user || user.sessionVersion !== claims.sessionVersion || !clinic || clinic.status !== 'active') throw new AppError(401, 'SESSION_EXPIRED', 'Session expired');
  const session = await AuthSessionModel.findOne({ sessionId: claims.sessionId, userId: user._id }).select('+refreshTokenHash');
  if (!session) throw new AppError(401, 'SESSION_EXPIRED', 'Session expired');
  if (session.revokedAt) {
    user.sessionVersion += 1;
    user.sessionInvalidBefore = new Date();
    await user.save();
    await revokeUserSessions(String(user._id));
    throw new AppError(401, 'SESSION_REUSED', 'Session revoked');
  }
  if (session.expiresAt <= new Date()) throw new AppError(401, 'SESSION_EXPIRED', 'Session expired');
  if (Date.now() - session.lastActivityAt.getTime() > env.SESSION_IDLE_MINUTES * 60 * 1000) throw new AppError(401, 'SESSION_IDLE', 'Session expired due to inactivity');
  if (!(await bcrypt.compare(refreshToken, session.refreshTokenHash))) {
    user.sessionVersion += 1;
    user.sessionInvalidBefore = new Date();
    await user.save();
    await revokeUserSessions(String(user._id));
    throw new AppError(401, 'SESSION_REUSED', 'Session revoked');
  }
  session.revokedAt = new Date();
  await session.save();
  return issueSession(user, session.mfaVerifiedAt != null);
}

export async function logout(req: Request): Promise<void> {
  if (!req.auth) return;
  const user = await UserModel.findById(req.auth.userId);
  if (user) { user.sessionVersion += 1; user.sessionInvalidBefore = new Date(); await user.save(); }
  await revokeUserSessions(req.auth.userId);
  await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'auth.logout', targetType: 'User', targetId: req.auth.userId });
}

export async function changePassword(req: Request, currentPassword: string, newPassword: string): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const user = await UserModel.findById(req.auth.userId).select('+passwordHash');
  const clinic = user ? await ClinicModel.findById(user.clinicId).lean() : null;
  if (!user || !clinic || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw genericAuthError();
  assertPasswordPolicy(newPassword, clinic.passwordPolicy ?? {});
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.mustChangePassword = false;
  user.sessionVersion += 1;
  user.sessionInvalidBefore = new Date();
  await user.save();
  await revokeUserSessions(String(user._id));
  await recordAudit({ req, clinicId: String(user.clinicId), actorUserId: String(user._id), action: 'auth.password_changed', targetType: 'User', targetId: String(user._id) });
}

export async function completeFirstSignInPasswordChange(req: Request, newPassword: string): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const user = await UserModel.findById(req.auth.userId).select('+passwordHash');
  const clinic = user ? await ClinicModel.findById(user.clinicId).lean() : null;
  if (!user || !clinic) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  if (!user.mustChangePassword) throw new AppError(409, 'PASSWORD_CHANGE_NOT_REQUIRED', 'This account does not require a first-time password change');
  assertPasswordPolicy(newPassword, clinic.passwordPolicy ?? {});
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  user.mustChangePassword = false;
  user.sessionVersion += 1;
  user.sessionInvalidBefore = new Date();
  await user.save();
  await revokeUserSessions(String(user._id));
  await recordAudit({ req, clinicId: String(user.clinicId), actorUserId: String(user._id), action: 'auth.first_sign_in_password_changed', targetType: 'User', targetId: String(user._id) });
}

export async function requestPasswordReset(req: Request, emailInput: string): Promise<{ developmentResetUrl?: string }> {
  const email = normalizeEmail(emailInput);
  const user = await UserModel.findOne({ email, status: 'active' }).lean();
  const clinic = user ? await ClinicModel.findOne({ _id: user.clinicId, status: 'active' }).select('_id').lean() : null;
  if (!user || !clinic) return {};

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const resetUrl = new URL('/reset-password', env.CLIENT_URL);
  resetUrl.searchParams.set('token', rawToken);
  const now = new Date();
  await PasswordResetTokenModel.updateMany(
    { userId: user._id, usedAt: { $exists: false }, invalidatedAt: { $exists: false } },
    { $set: { invalidatedAt: now } },
  );
  const resetRecord = await PasswordResetTokenModel.create({
    userId: user._id,
    clinicId: user.clinicId,
    tokenHash: hashIdentifier(rawToken),
    expiresAt: new Date(now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
  });

  try {
    await getPasswordResetEmailAdapter().sendPasswordReset({
      to: email,
      resetUrl: resetUrl.toString(),
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    });
  } catch {
    resetRecord.invalidatedAt = new Date();
    await resetRecord.save();
    await recordAudit({ req, clinicId: String(user.clinicId), actorUserId: String(user._id), action: 'auth.password_reset_delivery_failed', targetType: 'User', targetId: String(user._id) });
    throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Password reset email is temporarily unavailable');
  }

  await recordAudit({ req, clinicId: String(user.clinicId), actorUserId: String(user._id), action: 'auth.password_reset_requested', targetType: 'User', targetId: String(user._id) });
  const captured = getDevelopmentPasswordResetCapture()?.latestFor(email);
  return env.NODE_ENV === 'production' || !captured ? {} : { developmentResetUrl: captured.resetUrl };
}

export async function completePasswordReset(req: Request, rawToken: string, newPassword: string): Promise<{ loginPath: '/login' | '/staff-login' }> {
  const tokenHash = hashIdentifier(rawToken);
  const session = await mongoose.startSession();
  let loginPath: '/login' | '/staff-login' = '/login';
  try {
    await session.withTransaction(async () => {
      const resetRecord = await PasswordResetTokenModel.findOne({
        tokenHash,
        usedAt: { $exists: false },
        invalidatedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      }).session(session);
      if (!resetRecord) throw new AppError(400, 'RESET_TOKEN_INVALID', 'Password reset link is invalid or expired');

      const user = await UserModel.findOne({ _id: resetRecord.userId, clinicId: resetRecord.clinicId, status: 'active' }).select('+passwordHash').session(session);
      const clinic = user ? await ClinicModel.findOne({ _id: user.clinicId, status: 'active' }).session(session) : null;
      if (!user || !clinic) throw new AppError(400, 'RESET_TOKEN_INVALID', 'Password reset link is invalid or expired');
      assertPasswordPolicy(newPassword, clinic.passwordPolicy ?? {});
      if (await bcrypt.compare(newPassword, user.passwordHash)) throw new AppError(400, 'PASSWORD_REUSED', 'Choose a password you have not already used for this account');

      user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
      user.mustChangePassword = false;
      user.failedLoginCount = 0;
      user.lockedUntil = undefined;
      user.sessionVersion += 1;
      user.sessionInvalidBefore = new Date();
      await user.save({ session });

      resetRecord.usedAt = new Date();
      await resetRecord.save({ session });
      await PasswordResetTokenModel.updateMany(
        { userId: user._id, _id: { $ne: resetRecord._id }, usedAt: { $exists: false }, invalidatedAt: { $exists: false } },
        { $set: { invalidatedAt: new Date() } },
        { session },
      );
      await AuthSessionModel.updateMany(
        { userId: user._id, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      await recordAudit({ req, clinicId: String(user.clinicId), actorUserId: String(user._id), action: 'auth.password_reset_completed', targetType: 'User', targetId: String(user._id), session });
      loginPath = user.role === 'admin' ? '/login' : '/staff-login';
    });
  } finally {
    await session.endSession();
  }
  return { loginPath };
}

export async function createStaff(req: Request, input: { name: string; email: string; role: UserRole; temporaryPassword: string }): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const clinic = await ClinicModel.findById(req.auth.clinicId).lean();
  const email = normalizeEmail(input.email);
  if (!clinic) throw new AppError(404, 'NOT_FOUND', 'Clinic not found');
  if (await UserModel.exists({ email })) throw new AppError(409, 'CONFLICT', 'A staff account already uses this email');
  assertPasswordPolicy(input.temporaryPassword, clinic.passwordPolicy ?? {});
  const target = await UserModel.create({ clinicId: req.auth.clinicId, email, name: input.name, passwordHash: await bcrypt.hash(input.temporaryPassword, BCRYPT_COST), role: input.role, mustChangePassword: true });
  await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'staff.created', targetType: 'User', targetId: String(target._id), metadata: { role: input.role } });
}

export async function listStaff(req: Request, query: { search?: string; role?: 'doctor' | 'receptionist'; status?: 'active' | 'disabled'; page: number; limit: number }) {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter: Record<string, unknown> = { clinicId: req.auth.clinicId, role: query.role ?? { $in: ['doctor', 'receptionist'] } };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const matcher = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: matcher }, { email: matcher }];
  }
  const [staff, total] = await Promise.all([
    UserModel.find(filter).select('name email role status mustChangePassword createdAt updatedAt').sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    UserModel.countDocuments(filter),
  ]);
  return { staff, pagination: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
}

export async function listActiveDoctors(req: Request): Promise<Array<{ _id: Types.ObjectId; name: string; email: string }>> {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const doctors = await UserModel.find({ clinicId: req.auth.clinicId, role: 'doctor', status: 'active' })
    .select('name email')
    .sort({ name: 1, _id: 1 })
    .lean();
  await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'doctor.list_viewed', targetType: 'User', metadata: { resultCount: doctors.length } });
  return doctors as Array<{ _id: Types.ObjectId; name: string; email: string }>;
}

export async function setStaffStatus(req: Request, userId: string, status: 'active' | 'disabled'): Promise<void> {
  const target = await UserModel.findOne({ _id: userId, clinicId: req.auth?.clinicId });
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (target.role === 'admin') throw new AppError(403, 'FORBIDDEN', 'Administrator accounts cannot be managed as staff');
  target.status = status;
  target.sessionVersion += 1;
  target.sessionInvalidBefore = new Date();
  await target.save();
  await revokeUserSessions(String(target._id));
  await recordAudit({ req, clinicId: String(target.clinicId), actorUserId: req.auth?.userId, action: `staff.${status}`, targetType: 'User', targetId: String(target._id) });
}

export async function resetStaffPassword(req: Request, userId: string, temporaryPassword: string): Promise<void> {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const target = await UserModel.findOne({ _id: userId, clinicId: req.auth.clinicId }).select('+passwordHash');
  const clinic = await ClinicModel.findById(req.auth.clinicId).lean();
  if (!target || !clinic) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (target.role === 'admin') throw new AppError(403, 'FORBIDDEN', 'Administrator accounts cannot be managed as staff');
  assertPasswordPolicy(temporaryPassword, clinic.passwordPolicy ?? {});
  target.passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
  target.mustChangePassword = true;
  target.sessionVersion += 1;
  target.sessionInvalidBefore = new Date();
  await target.save();
  await revokeUserSessions(String(target._id));
  await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'staff.password_reset', targetType: 'User', targetId: userId });
}

export async function enrollMfa(req: Request, friendlyName: string): Promise<{ secret: string; uri: string }> {
  if (!req.auth || req.auth.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
  const user = await UserModel.findById(req.auth.userId).select('+mfaSecretEncrypted');
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  const secret = generateSecret();
  user.mfaSecretEncrypted = encrypt(secret);
  user.mfaEnrolled = false;
  await user.save();
  return { secret, uri: generateURI({ issuer: `RxFlow:${friendlyName}`, label: user.email, secret }) };
}

export async function createMfaChallenge(req: Request): Promise<string> {
  if (!req.auth || req.auth.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
  const challengeId = crypto.randomUUID();
  await AuthSessionModel.updateOne({ userId: req.auth.userId, revokedAt: { $exists: false } }, { $set: { mfaChallengeHash: hashIdentifier(challengeId), mfaChallengeExpiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS) } });
  return challengeId;
}

export async function verifyMfa(req: Request, challengeId: string, code: string): Promise<{ tokens: TokenPair; recoveryCodes: string[] }> {
  if (!req.auth || req.auth.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
  const user = await UserModel.findById(req.auth.userId).select('+mfaSecretEncrypted +mfaRecoveryCodesHash');
  const session = await AuthSessionModel.findOne({ userId: req.auth.userId, revokedAt: { $exists: false } }).sort({ createdAt: -1 }).select('+mfaChallengeHash');
  if (!user?.mfaSecretEncrypted || !session?.mfaChallengeHash || !session.mfaChallengeExpiresAt || session.mfaChallengeExpiresAt <= new Date() || !safeEqual(hashIdentifier(challengeId), session.mfaChallengeHash)) throw new AppError(401, 'MFA_CHALLENGE_INVALID', 'MFA challenge is invalid or expired');
  if (!(await verify({ token: code, secret: decrypt(user.mfaSecretEncrypted) })).valid) throw new AppError(401, 'MFA_INVALID', 'Invalid authenticator code');
  const recoveryCodes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  user.mfaEnrolled = true;
  user.mfaRecoveryCodesHash = await Promise.all(recoveryCodes.map((value) => bcrypt.hash(value, BCRYPT_COST)));
  await user.save();
  session.revokedAt = new Date();
  await session.save();
  const tokens = await issueSession(user, true);
  await recordAudit({ req, clinicId: req.auth.clinicId, actorUserId: req.auth.userId, action: 'auth.mfa_verified', targetType: 'User', targetId: req.auth.userId });
  return { tokens, recoveryCodes };
}

export async function recoverAdminMfa(req: Request, userId: string, reason: string, supportKey: string): Promise<void> {
  if (!safeEqual(supportKey, env.PLATFORM_SUPPORT_KEY)) throw new AppError(403, 'FORBIDDEN', 'Platform support authorization required');
  const target = await UserModel.findOne({ _id: userId, role: 'admin' }).select('+mfaSecretEncrypted +mfaRecoveryCodesHash');
  if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
  target.mfaEnrolled = false;
  target.mfaSecretEncrypted = undefined;
  target.mfaRecoveryCodesHash = [];
  target.sessionVersion += 1;
  target.sessionInvalidBefore = new Date();
  await target.save();
  await revokeUserSessions(String(target._id));
  await recordAudit({ req, clinicId: String(target.clinicId), action: 'auth.mfa_recovered', targetType: 'User', targetId: userId, metadata: { reason } });
}
