import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';
import { allowedOrigins, env } from './env.js';
import { requireJarvisSession } from './auth.js';
import { runTurn } from './orchestrator.js';

const messageSchema = z.strictObject({ sessionId: z.string().uuid(), message: z.string().trim().min(1).max(env.AGENT_MAX_INPUT_CHARS), clientTurnId: z.string().uuid() });
const speechSchema = z.strictObject({ text: z.string().trim().min(1).max(1200), voiceId: z.string().trim().min(1).max(100).optional() });
const logger = pino({ redact: ['req.headers', 'req.body', 'res.headers'] });

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes(origin)) callback(null, true); else callback(new Error('Origin not allowed')); }, credentials: false, methods: ['GET', 'POST', 'OPTIONS'] }));
  app.use(express.json({ limit: '24kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === 'test' ? 1000 : 60, standardHeaders: true, legacyHeaders: false }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', (_req, res) => {
    const providerConfigured = env.AI_PROVIDER === 'none' || (env.AI_PROVIDER === 'openai' ? Boolean(env.OPENAI_API_KEY) : Boolean(env.GEMINI_API_KEY));
    res.status(providerConfigured ? 200 : 503).json({ status: providerConfigured ? 'ready' : 'provider_not_configured', provider: env.AI_PROVIDER, providerConfigured, elevenLabsConfigured: env.ELEVENLABS_ENABLED });
  });
  app.post('/v1/messages', requireJarvisSession, async (req, res, next) => {
    try {
      const body = messageSchema.parse(req.body);
      if (body.sessionId !== req.jarvis!.sessionId) return res.status(403).json({ success: false, error: { code: 'SESSION_MISMATCH', message: 'Friday session mismatch' } });
      const controller = new AbortController();
      req.once('aborted', () => controller.abort());
      const data = await runTurn(req.jarvis!, body, controller.signal);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  });
  app.post('/v1/speech', requireJarvisSession, async (req, res, next) => {
    try {
      if (!env.ELEVENLABS_ENABLED) return res.status(503).json({ success: false, error: { code: 'VOICE_NOT_CONFIGURED', message: 'ElevenLabs voice is not configured' } });
      const body = speechSchema.parse(req.body);
      const targetVoiceId = body.voiceId || env.ELEVENLABS_VOICE_ID;
      if (!targetVoiceId) return res.status(400).json({ success: false, error: { code: 'VOICE_ID_MISSING', message: 'Voice ID is required' } });
      const clientAbort = new AbortController();
      req.once('aborted', () => clientAbort.abort());
      const signal = AbortSignal.any([clientAbort.signal, AbortSignal.timeout(env.AGENT_REQUEST_TIMEOUT_MS)]);
      const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(targetVoiceId)}/stream?output_format=${encodeURIComponent(env.ELEVENLABS_OUTPUT_FORMAT)}`, {
        method: 'POST',
        signal,
        headers: { 'xi-api-key': env.ELEVENLABS_API_KEY!, 'content-type': 'application/json' },
        body: JSON.stringify({ text: body.text, model_id: env.ELEVENLABS_MODEL_ID, voice_settings: { stability: 0.65, similarity_boost: 0.82, style: 0.12, use_speaker_boost: true } }),
      });
      if (!upstream.ok || !upstream.body) return res.status(502).json({ success: false, error: { code: 'VOICE_PROVIDER_ERROR', message: 'Voice output is temporarily unavailable' } });
      res.status(200); res.setHeader('content-type', upstream.headers.get('content-type') ?? 'audio/mpeg'); res.setHeader('cache-control', 'no-store');
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        if (clientAbort.signal.aborted || res.destroyed) break;
        if (!res.write(chunk)) await new Promise<void>((resolve) => res.once('drain', resolve));
      }
      if (!res.destroyed) res.end();
    } catch (error) { next(error); }
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const value = error as { status?: number; code?: string; message?: string; name?: string };
    const status = value.status ?? (value.name === 'ZodError' ? 400 : 500);
    res.status(status).json({ success: false, error: { code: value.code ?? (status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'), message: status >= 500 ? 'Jarvis could not complete the request. Continue manually or retry.' : value.message ?? 'Request failed' } });
  });
  return app;
}
