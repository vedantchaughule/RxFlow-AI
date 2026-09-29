import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRole } from '../modules/users/user.model.js';
import { AppError } from './errors.js';

export type AccessClaims = {
  userId: string;
  clinicId: string;
  role: UserRole;
  sessionVersion: number;
  sessionId: string;
  mfaVerified: boolean;
  type: 'access';
};

export type RefreshClaims = {
  userId: string;
  clinicId: string;
  sessionVersion: number;
  sessionId: string;
  type: 'refresh';
};

export function createSessionId(): string {
  return crypto.randomUUID();
}

export function signAccessToken(claims: Omit<AccessClaims, 'type'>): string {
  return jwt.sign({ ...claims, type: 'access' }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function signRefreshToken(claims: Omit<RefreshClaims, 'type'>): string {
  return jwt.sign({ ...claims, type: 'refresh' }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as Partial<AccessClaims>;
    if (claims.type !== 'access' || !claims.userId || !claims.clinicId || !claims.role || !claims.sessionId || typeof claims.sessionVersion !== 'number') {
      throw new AppError(401, 'TOKEN_INVALID', 'Invalid access token claims');
    }
    return claims as AccessClaims;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token expired');
    }
    throw new AppError(401, 'TOKEN_INVALID', 'Invalid access token');
  }
}

export function verifyRefreshToken(token: string): RefreshClaims {
  try {
    const claims = jwt.verify(token, env.JWT_REFRESH_SECRET) as Partial<RefreshClaims>;
    if (claims.type !== 'refresh' || !claims.userId || !claims.clinicId || !claims.sessionId || typeof claims.sessionVersion !== 'number') {
      throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Invalid refresh token claims');
    }
    return claims as RefreshClaims;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Refresh token expired');
    }
    throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Invalid refresh token');
  }
}

