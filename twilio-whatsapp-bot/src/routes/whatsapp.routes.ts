import { Router, urlencoded } from 'express';
import { validateTwilioWebhook } from '../twilio/validate-webhook.js';
import { processInboundMessage } from '../conversation/conversation.service.js';
import { webhookRateLimiter } from '../security/rate-limit.js';

export const whatsappRouter = Router();

// Store processed MessageSids for idempotency
const processedSids = new Set<string>();

whatsappRouter.post(
  ['/webhooks/twilio/whatsapp', '/webhook/twilio/whatsapp'],
  webhookRateLimiter,
  urlencoded({ extended: false, limit: '32kb', parameterLimit: 50 }),
  validateTwilioWebhook,
  async (req, res, next) => {
    try {
      const { MessageSid, From, Body } = req.body || {};

      if (!MessageSid || !From) {
        return res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Missing MessageSid or From parameter' } });
      }

      // Idempotency check
      if (processedSids.has(MessageSid)) {
        return res.status(200).send('<Response></Response>');
      }
      processedSids.add(MessageSid);

      // Clean memory set over time
      if (processedSids.size > 5000) {
        processedSids.clear();
      }

      const replyText = await processInboundMessage(From, Body || '');

      const safeReplyText = (replyText || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Return TwiML response
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safeReplyText}</Message></Response>`;
      res.setHeader('Content-Type', 'text/xml');
      res.status(200).send(twiml);
    } catch (error) {
      next(error);
    }
  }
);
