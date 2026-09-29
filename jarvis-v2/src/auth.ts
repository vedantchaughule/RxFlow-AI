import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from './env.js';

export type JarvisClaims = {
  iss: 'rxflow-backend';
  aud: 'rxflow-jarvis-v2' | 'rxflow-jarvis-agent';
  sub: string;
  sessionId: string;
  clinicId: string;
  doctorId: string;
  role: 'doctor' | 'admin';
  tokenVersion: number;
  boundPatientId?: string | null;
  boundQueueEntryId?: string | null;
  exp?: number;
  iat?: number;
};

export class AuthError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function signJarvisTokenNative(payload: Record<string, unknown>, secret = env.JARVIS_SESSION_JWT_SECRET, expiresInSeconds = env.JARVIS_SESSION_TTL_SECONDS): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const message = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${message}.${signature}`;
}

export function verifyJarvisToken(token: string): JarvisClaims {
  if (!env.JARVIS_SESSION_JWT_SECRET) {
    throw new AuthError(503, 'JARVIS_NOT_CONFIGURED', 'Jarvis session signing is not configured');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError(401, 'JARVIS_TOKEN_INVALID', 'Invalid Jarvis session token structure');
  }

  const [headerB64, payloadB64, signature] = parts;
  const message = `${headerB64}.${payloadB64}`;

  const expectedSignature = crypto
    .createHmac('sha256', env.JARVIS_SESSION_JWT_SECRET)
    .update(message)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuf = Buffer.from(signature!);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AuthError(401, 'JARVIS_TOKEN_INVALID', 'Invalid Jarvis session token signature');
  }

  let decoded: any;
  try {
    decoded = JSON.parse(base64UrlDecode(payloadB64!));
  } catch {
    throw new AuthError(401, 'JARVIS_TOKEN_INVALID', 'Invalid token payload JSON');
  }

  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp && decoded.exp <= now) {
    throw new AuthError(401, 'JARVIS_SESSION_EXPIRED', 'Jarvis session expired');
  }

  if (decoded.iss !== 'rxflow-backend') {
    throw new AuthError(401, 'JARVIS_ISSUER_INVALID', 'Invalid token issuer');
  }

  if (decoded.aud !== 'rxflow-jarvis-v2' && decoded.aud !== 'rxflow-jarvis-agent') {
    throw new AuthError(401, 'JARVIS_AUDIENCE_INVALID', 'Invalid token audience');
  }

  if (decoded.role !== 'doctor' && decoded.role !== 'admin') {
    throw new AuthError(403, 'FORBIDDEN', 'Jarvis access is restricted to doctors and administrators');
  }

  if (!decoded.sessionId || !decoded.clinicId || !decoded.doctorId) {
    throw new AuthError(401, 'JARVIS_CLAIMS_INVALID', 'Missing required session claims');
  }

  return decoded as JarvisClaims;
}

export function requireJarvisSession(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!env.JARVIS_ENABLED) {
      throw new AuthError(503, 'JARVIS_DISABLED', 'Jarvis service is disabled');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError(401, 'UNAUTHENTICATED', 'Bearer session token is required');
    }

    const token = authHeader.substring(7).trim();
    const claims = verifyJarvisToken(token);

    (req as any).jarvisSession = claims;
    next();
  } catch (err) {
    next(err);
  }
}

const processNonces = new Map<string, number>();

function cleanupNonces(now: number): void {
  for (const [nonce, expires] of processNonces.entries()) {
    if (expires <= now) {
      processNonces.delete(nonce);
    }
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireSignedInternal(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!env.JARVIS_INTERNAL_HMAC_SECRET) {
      throw new AuthError(503, 'JARVIS_NOT_CONFIGURED', 'Jarvis internal authentication is not configured');
    }

    const timestamp = req.header('x-jarvis-timestamp');
    const nonce = req.header('x-jarvis-nonce');
    const digest = req.header('x-jarvis-content-sha256');
    const signature = req.header('x-jarvis-signature');

    const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body || {})));

    if (!timestamp || !nonce || !digest || !signature || !rawBody) {
      throw new AuthError(401, 'JARVIS_SIGNATURE_INVALID', 'Invalid Jarvis internal authentication headers');
    }

    const time = Number(timestamp);
    const now = Date.now();
    const maxSkewMs = env.JARVIS_INTERNAL_MAX_SKEW_SECONDS * 1000;

    if (!Number.isFinite(time) || Math.abs(now - time) > maxSkewMs) {
      throw new AuthError(401, 'JARVIS_SIGNATURE_STALE', 'Jarvis internal request expired');
    }

    cleanupNonces(now);
    if (processNonces.has(nonce)) {
      throw new AuthError(409, 'JARVIS_REPLAY', 'Jarvis internal request already processed');
    }

    const computedDigest = crypto.createHash('sha256').update(rawBody).digest('hex');
    if (!safeEqual(computedDigest, digest)) {
      throw new AuthError(401, 'JARVIS_SIGNATURE_INVALID', 'Payload digest mismatch');
    }

    const requestPath = req.originalUrl?.split('?')[0] ?? req.path;
    const canonical = [req.method.toUpperCase(), requestPath, timestamp, nonce, digest].join('\n');
    const expected = crypto.createHmac('sha256', env.JARVIS_INTERNAL_HMAC_SECRET).update(canonical).digest('hex');

    if (!safeEqual(expected, signature)) {
      throw new AuthError(401, 'JARVIS_SIGNATURE_INVALID', 'Jarvis signature verification failed');
    }

    processNonces.set(nonce, now + maxSkewMs);
    next();
  } catch (err) {
    next(err);
  }
}

export function signInternalRequest(method: string, path: string, body: unknown, hmacSecret = env.JARVIS_INTERNAL_HMAC_SECRET): Record<string, string> {
  if (!hmacSecret) {
    throw new AuthError(503, 'JARVIS_NOT_CONFIGURED', 'Jarvis internal HMAC secret is not configured');
  }

  const rawBody = typeof body === 'string' ? Buffer.from(body) : Buffer.from(JSON.stringify(body ?? {}));
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const canonical = [method.toUpperCase(), path, timestamp, nonce, digest].join('\n');
  const signature = crypto.createHmac('sha256', hmacSecret).update(canonical).digest('hex');

  return {
    'x-jarvis-timestamp': timestamp,
    'x-jarvis-nonce': nonce,
    'x-jarvis-content-sha256': digest,
    'x-jarvis-signature': signature,
    'content-type': 'application/json',
  };
}
