import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';

export type JarvisClaims = {
  iss: 'rxflow-backend';
  aud: 'rxflow-jarvis-agent';
  sub: string;
  sessionId: string;
  clinicId: string;
  doctorId: string;
  role: 'doctor';
  tokenVersion: number;
  boundPatientId?: string;
  boundQueueEntryId?: string;
};

function secret(): string {
  if (!env.JARVIS_SESSION_JWT_SECRET) throw new AppError(503, 'JARVIS_NOT_CONFIGURED', 'Jarvis session signing is not configured');
  return env.JARVIS_SESSION_JWT_SECRET;
}

export function signJarvisToken(claims: Omit<JarvisClaims, 'iss' | 'aud' | 'sub'>): string {
  return jwt.sign({ ...claims, iss: 'rxflow-backend', aud: 'rxflow-jarvis-agent', sub: claims.doctorId }, secret(), { expiresIn: env.JARVIS_SESSION_TTL_SECONDS });
}
