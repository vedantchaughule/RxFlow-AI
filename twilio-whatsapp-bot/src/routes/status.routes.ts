import { Router, urlencoded } from 'express';
import pino from 'pino';
import { validateTwilioWebhook } from '../twilio/validate-webhook.js';
import { webhookRateLimiter } from '../security/rate-limit.js';
import { messageStatusStore, type MessageDeliveryStatus } from '../twilio/message-status.store.js';

const logger = pino({
  redact: {
    paths: ['to', 'from'],
    censor: '[REDACTED]',
  },
});

export const statusRouter = Router();

statusRouter.post(
  ['/webhooks/twilio/status', '/webhook/twilio/status'],
  webhookRateLimiter,
  urlencoded({ extended: false, limit: '32kb', parameterLimit: 50 }),
  validateTwilioWebhook,
  (req, res) => {
    const { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage } = req.body || {};

    if (!MessageSid) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_MESSAGESID', message: 'MessageSid parameter is required' },
      });
    }

    const rawStatus = (MessageStatus || '').toLowerCase();
    const validStatuses: MessageDeliveryStatus[] = ['queued', 'sent', 'delivered', 'undelivered', 'failed', 'read'];
    const status: MessageDeliveryStatus = validStatuses.includes(rawStatus as MessageDeliveryStatus)
      ? (rawStatus as MessageDeliveryStatus)
      : 'queued';

    const record = messageStatusStore.updateStatus(
      MessageSid,
      status,
      ErrorCode,
      ErrorMessage,
      To,
      From
    );

    logger.info(
      {
        messageSid: MessageSid,
        status,
        errorCode: ErrorCode || undefined,
        errorMessage: ErrorMessage || undefined,
      },
      'Twilio outbound message status callback processed'
    );

    return res.status(200).json({
      success: true,
      messageSid: MessageSid,
      status,
      record,
    });
  }
);
