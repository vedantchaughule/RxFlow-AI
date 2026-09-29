import { z } from 'zod';

try {
  // @ts-ignore
  const dotenv = await import('dotenv');
  dotenv.default?.config?.() || dotenv.config?.();
} catch {
  // Environment variables are inherited from process.env if dotenv is omitted
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5001),
  JARVIS_ENABLED: z.string().default('true').transform((v) => v === 'true' || v === '1'),
  
  JARVIS_SESSION_JWT_SECRET: z.string().default('synthetic-test-jwt-secret-32-chars-long!!'),
  JARVIS_INTERNAL_HMAC_SECRET: z.string().default('synthetic-test-hmac-secret-32-chars-long!!'),
  JARVIS_SESSION_TTL_SECONDS: z.coerce.number().default(900),
  JARVIS_INTERNAL_MAX_SKEW_SECONDS: z.coerce.number().default(300),

  AI_PROVIDER: z.enum(['none', 'openai', 'gemini']).default('none'),
  
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta'),

  JARVIS_REQUEST_TIMEOUT_MS: z.coerce.number().default(10000),
  MAX_INPUT_CHARS: z.coerce.number().default(2000),
  MAX_TOOL_STEPS: z.coerce.number().default(3),
  MAX_AGENT_STEPS: z.coerce.number().default(6),
  BACKEND_URL: z.string().default('http://localhost:5000'),

  ELEVENLABS_ENABLED: z.string().default('true').transform((v) => v === 'true' || v === '1'),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_STT_MODEL_ID: z.string().default('scribe_v2_realtime'),
  ELEVENLABS_VOICE_ID: z.string().default('pNInz6obpgDQGcFmaJgB'),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_flash_v2_5'),
  ELEVENLABS_OUTPUT_FORMAT: z.string().default('mp3_44100_128'),
});

export const env = envSchema.parse(process.env);
