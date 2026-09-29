import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z.preprocess((value) => value === 'true', z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(64),
  JWT_REFRESH_SECRET: z.string().min(64),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  CLIENT_URL: z.url(),
  CORS_ORIGINS: z.string().min(1),
  COOKIE_SECURE: booleanFromString.default(false),
  COOKIE_DOMAIN: z.string().optional().default(''),
  AUTH_COOKIE_NAME: z.string().min(1).default('rxflow_refresh'),
  PLATFORM_SUPPORT_KEY: z.string().min(32),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(15),
  SESSION_MAX_DAYS: z.coerce.number().int().positive().default(7),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  MIN_PASSWORD_LENGTH: z.coerce.number().int().min(12).default(12),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(30),
  EMAIL_ADAPTER: z.enum(['capture', 'smtp']).default('capture'),
  EMAIL_FROM: z.email().default('noreply@example.test'),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromString.default(false),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  AI_KILL_SWITCH: booleanFromString.default(false),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_TTS_MODEL: z.string().default('eleven_flash_v2_5'),
  ELEVENLABS_OUTPUT_FORMAT: z.string().default('mp3_44100_128'),
  ELEVENLABS_REQUEST_TIMEOUT_MS: z.coerce.number().default(10000),
  ELEVENLABS_ENABLED: booleanFromString.default(false),
  JARVIS_ENABLED: booleanFromString.default(false),
  JARVIS_AGENT_URL: z.url().optional(),
  JARVIS_SESSION_JWT_SECRET: z.string().min(64).optional(),
  JARVIS_INTERNAL_HMAC_SECRET: z.string().min(64).optional(),
  JARVIS_SESSION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  JARVIS_INTERNAL_MAX_SKEW_SECONDS: z.coerce.number().int().min(10).max(300).default(60),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
if (env.NODE_ENV === 'production' && env.EMAIL_ADAPTER !== 'smtp') {
  throw new Error('Production requires EMAIL_ADAPTER=smtp');
}
if (env.EMAIL_ADAPTER === 'smtp' && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS)) {
  throw new Error('SMTP email adapter configuration is incomplete');
}
if (env.JARVIS_ENABLED && (!env.JARVIS_AGENT_URL || !env.JARVIS_SESSION_JWT_SECRET || !env.JARVIS_INTERNAL_HMAC_SECRET)) {
  throw new Error('Jarvis is enabled but its URL or shared secrets are missing');
}
export const corsOrigins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);

