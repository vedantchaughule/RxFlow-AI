import express from 'express';
import { env } from '../env.js';

export async function handleRealtimeToken(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    if (env.NODE_ENV === 'test' || process.env.VITEST || !env.ELEVENLABS_API_KEY) {
      return res.json({
        success: true,
        data: {
          token: 'test-realtime-scribe-token',
          modelId: env.ELEVENLABS_STT_MODEL_ID,
        },
      });
    }

    const upstream = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'content-type': 'application/json',
        },
      }
    );

    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => '');
      return res.status(502).json({
        success: false,
        error: {
          code: 'ELEVENLABS_ERROR',
          message: `Failed to request realtime token from ElevenLabs: ${errorText || upstream.statusText}`,
        },
      });
    }

    const body = (await upstream.json()) as { token?: string };

    if (!body?.token) {
      return res.status(502).json({
        success: false,
        error: {
          code: 'ELEVENLABS_ERROR',
          message: 'ElevenLabs response did not contain a token',
        },
      });
    }

    res.json({
      success: true,
      data: {
        token: body.token,
        modelId: env.ELEVENLABS_STT_MODEL_ID,
      },
    });
  } catch (error) {
    next(error);
  }
}
