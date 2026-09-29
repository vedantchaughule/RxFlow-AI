import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';

const nonces = new Map<string, number>();
function cleanup(now: number) {
  for (const [nonce, expires] of nonces) if (expires <= now) nonces.delete(nonce);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireJarvisInternal(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (!env.JARVIS_INTERNAL_HMAC_SECRET) throw new AppError(503, 'JARVIS_NOT_CONFIGURED', 'Jarvis internal authentication is not configured');
    const timestamp = req.header('x-jarvis-timestamp');
    const nonce = req.header('x-jarvis-nonce');
    const digest = req.header('x-jarvis-content-sha256');
    const signature = req.header('x-jarvis-signature');
    if (!timestamp || !nonce || !digest || !signature || !req.rawBody) throw new AppError(401, 'JARVIS_SIGNATURE_INVALID', 'Invalid Jarvis service authentication');
    const time = Number(timestamp);
    const now = Date.now();
    if (!Number.isFinite(time) || Math.abs(now - time) > env.JARVIS_INTERNAL_MAX_SKEW_SECONDS * 1000) throw new AppError(401, 'JARVIS_SIGNATURE_STALE', 'Jarvis service authentication expired');
    cleanup(now);
    if (nonces.has(nonce)) throw new AppError(409, 'JARVIS_REPLAY', 'Jarvis request already processed');
    const computedDigest = crypto.createHash('sha256').update(req.rawBody).digest('hex');
    if (!safeEqual(computedDigest, digest)) throw new AppError(401, 'JARVIS_SIGNATURE_INVALID', 'Invalid Jarvis service authentication');
    const requestPath = req.originalUrl.split('?')[0] ?? req.path;
    const canonical = [req.method.toUpperCase(), requestPath, timestamp, nonce, digest].join('\n');
    const expected = crypto.createHmac('sha256', env.JARVIS_INTERNAL_HMAC_SECRET).update(canonical).digest('hex');
    if (!safeEqual(expected, signature)) throw new AppError(401, 'JARVIS_SIGNATURE_INVALID', 'Invalid Jarvis service authentication');
    nonces.set(nonce, now + env.JARVIS_INTERNAL_MAX_SKEW_SECONDS * 1000);
    next();
  } catch (error) { next(error); }
}
