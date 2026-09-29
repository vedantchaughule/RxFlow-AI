import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/shared/encryption.js';
import { AppError } from '../src/shared/errors.js';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/shared/jwt.js';

describe('local authentication primitives', () => {
  it('signs and verifies an access token with the required claims', () => {
    const token = signAccessToken({ userId: 'user-id', clinicId: 'clinic-id', role: 'admin', sessionVersion: 2, sessionId: 'session-id', mfaVerified: true });
    expect(verifyAccessToken(token)).toMatchObject({ userId: 'user-id', clinicId: 'clinic-id', role: 'admin', sessionVersion: 2, sessionId: 'session-id', mfaVerified: true, type: 'access' });
  });

  it('keeps refresh tokens distinct from access tokens', () => {
    const token = signRefreshToken({ userId: 'user-id', clinicId: 'clinic-id', sessionVersion: 2, sessionId: 'session-id' });
    expect(verifyRefreshToken(token)).toMatchObject({ type: 'refresh', sessionId: 'session-id' });
    expect(() => verifyAccessToken(token)).toThrowError(AppError);
    try {
      verifyAccessToken(token);
    } catch (err: any) {
      expect(err.code).toBe('TOKEN_INVALID');
      expect(err.statusCode).toBe(401);
    }
  });

  it('encrypts local TOTP material with authenticated encryption', () => {
    const encrypted = encrypt('JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decrypt(encrypted)).toBe('JBSWY3DPEHPK3PXP');
  });
});
