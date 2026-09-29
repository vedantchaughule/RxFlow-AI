import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AuthSessionModel } from '../modules/auth/auth-session.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { ClinicModel } from '../modules/clinics/clinic.model.js';
import { AppError } from '../shared/errors.js';
import { verifyAccessToken } from '../shared/jwt.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    const accessToken = header.slice('Bearer '.length).trim();
    const claims = verifyAccessToken(accessToken);
    const user = await UserModel.findById(claims.userId).lean();
    const clinic = user ? await ClinicModel.findById(user.clinicId).select('status').lean() : null;
    if (user?.status === 'disabled') {
      await AuthSessionModel.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
      throw new AppError(401, 'ACCOUNT_DISABLED', 'Your account has been disabled');
    }
    if (!user || user.sessionVersion !== claims.sessionVersion || !clinic || clinic.status !== 'active') {
      if (user && clinic?.status === 'suspended') {
        await AuthSessionModel.updateMany({ userId: user._id, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
      }
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked');

    const session = await AuthSessionModel.findOne({ sessionId: claims.sessionId, userId: user._id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
    if (!session) throw new AppError(401, 'SESSION_REVOKED', 'Session revoked');
    if (Date.now() - session.lastActivityAt.getTime() > env.SESSION_IDLE_MINUTES * 60 * 1000) throw new AppError(401, 'SESSION_IDLE', 'Session expired due to inactivity');
    session.lastActivityAt = new Date();
    await session.save();

    req.auth = {
      accessToken,
      userId: String(user._id),
      clinicId: String(user.clinicId),
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      mfaEnrolled: user.mfaEnrolled,
      mfaVerified: claims.mfaVerified === true,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Array<'admin' | 'doctor' | 'receptionist'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
    next();
  };
}

export function requirePasswordReady(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.mustChangePassword) return next(new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Password change required before continuing'));
  next();
}

export function requireAdminMfa(_req: Request, _res: Response, next: NextFunction): void {
  // Password-only sign-in is the current product flow. Kept as a no-op so
  // route composition remains compatible if MFA is introduced in a future release.
  next();
}
