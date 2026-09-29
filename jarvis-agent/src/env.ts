import 'dotenv/config';
import { z } from 'zod';

const bool = z.preprocess((value) => value === 'true', z.boolean());
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  JARVIS_PUBLIC_URL: z.url().default('http://localhost:5001'),
  JARVIS_ALLOWED_ORIGINS: z.string().min(1),
  RXFLOW_BACKEND_URL: z.url(),
  JARVIS_SESSION_JWT_SECRET: z.string().min(64),
  JARVIS_INTERNAL_HMAC_SECRET: z.string().min(64),
  AI_PROVIDER: z.enum(['none', 'openai', 'gemini']).default('none'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  GEMINI_BASE_URL: z.url().default('https://generativelanguage.googleapis.com/v1beta'),
  AGENT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  AGENT_MAX_INPUT_CHARS: z.coerce.number().int().min(100).max(12000).default(4000),
  AGENT_MAX_TOOL_STEPS: z.coerce.number().int().min(1).max(8).default(4),
  ELEVENLABS_ENABLED: bool.default(false),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().default('TRnaQb7q41oL7sV0w6Bu'),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_flash_v2_5'),
  ELEVENLABS_OUTPUT_FORMAT: z.string().default('mp3_44100_128'),
});
const result = schema.safeParse(process.env);
if (!result.success) throw new Error(`Invalid Jarvis configuration: ${JSON.stringify(result.error.flatten().fieldErrors)}`);
export const env = result.data;
if (env.AI_PROVIDER === 'openai' && (!env.OPENAI_API_KEY || !env.OPENAI_MODEL)) throw new Error('OPENAI_API_KEY and OPENAI_MODEL are required when AI_PROVIDER=openai');
if (env.AI_PROVIDER === 'gemini' && (!env.GEMINI_API_KEY || !env.GEMINI_MODEL)) throw new Error('GEMINI_API_KEY and GEMINI_MODEL are required when AI_PROVIDER=gemini');
if (env.ELEVENLABS_ENABLED && (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID)) throw new Error('ElevenLabs is enabled but its API key or voice ID is missing');
export const allowedOrigins = env.JARVIS_ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
