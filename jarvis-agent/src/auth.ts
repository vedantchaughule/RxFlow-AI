import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from './env.js';
import type { JarvisClaims } from './types.js';

declare global { namespace Express { interface Request { jarvis?: JarvisClaims; } } }

export function requireJarvisSession(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new Error('Missing Jarvis token');
    const claims = jwt.verify(header.slice(7), env.JARVIS_SESSION_JWT_SECRET, { issuer: 'rxflow-backend', audience: 'rxflow-jarvis-agent' }) as JarvisClaims;
    if (!claims.sessionId || !claims.clinicId || claims.sub !== claims.doctorId) throw new Error('Invalid Jarvis claims');
    req.jarvis = claims;
    next();
  } catch { resError(next, 401, 'JARVIS_SESSION_INVALID', 'Jarvis session is invalid or expired'); }
}
function resError(next: NextFunction, status: number, code: string, message: string) { next(Object.assign(new Error(message), { status, code })); }
