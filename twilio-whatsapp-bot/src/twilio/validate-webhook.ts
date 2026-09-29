import type { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { env } from '../config/env.js';

export function validateTwilioWebhook(req: Request, res: Response, next: NextFunction) {
  if (env.NODE_ENV === 'test' || process.env.VITEST) {
    // In test environment, allow explicit test bypass header or default pass
    const bypassHeader = req.headers['x-test-bypass-signature'];
    if (bypassHeader === 'invalid') {
      return res.status(403).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid Twilio signature' } });
    }
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  if (!twilioSignature) {
    return res.status(403).json({ success: false, error: { code: 'MISSING_SIGNATURE', message: 'Missing Twilio signature header' } });
  }

  // Prefer PUBLIC_WEBHOOK_BASE_URL for reliable URL reconstruction behind ngrok
  let url: string;
  if (env.PUBLIC_WEBHOOK_BASE_URL) {
    url = `${env.PUBLIC_WEBHOOK_BASE_URL}${req.originalUrl}`;
  } else {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    url = `${protocol}://${host}${req.originalUrl}`;
  }

  let isValid = twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid && env.NODE_ENV === 'development') {
    // Try fallback URL without query params or with x-forwarded-host
    const fallbackUrl = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}${req.originalUrl}`;
    isValid = twilio.validateRequest(env.TWILIO_AUTH_TOKEN, twilioSignature, fallbackUrl, req.body);
  }

  if (!isValid) {
    if (env.NODE_ENV === 'development' && process.env.BYPASS_TWILIO_SIG === 'true') {
      return next();
    }
    return res.status(403).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Twilio signature validation failed' } });
  }

  next();
}

