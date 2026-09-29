import { z } from 'zod';
import { env } from '../config/env.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const passwordSchema = z.string().min(env.MIN_PASSWORD_LENGTH).max(128);
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
