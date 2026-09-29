import { twilioClient } from './twilio.client.js';
import { env } from '../config/env.js';

export interface SendWhatsAppMessageOptions {
  to: string;
  body: string;
  from?: string;
}

export async function sendWhatsAppTextMessage(options: SendWhatsAppMessageOptions) {
  const from = options.from || env.TWILIO_WHATSAPP_FROM;
  const to = options.to.startsWith('whatsapp:') ? options.to : `whatsapp:${options.to}`;

  return await twilioClient.messages.create({
    from,
    to,
    body: options.body,
  });
}
