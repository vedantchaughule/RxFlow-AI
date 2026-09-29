import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4300),

  TWILIO_ACCOUNT_SID: z.string().default('AC_TEST_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: z.string().default('TEST_AUTH_TOKEN'),
  TWILIO_WHATSAPP_FROM: z.string().default('whatsapp:+14155238886'),

  PUBLIC_WEBHOOK_BASE_URL: z.string().optional(),

  TWILIO_APPOINTMENT_CONFIRMATION_CONTENT_SID: z.string().default('HX_CONFIRMATION_DEFAULT_SID'),
  TWILIO_APPOINTMENT_REMINDER_CONTENT_SID: z.string().default('HX_REMINDER_DEFAULT_SID'),
  TWILIO_APPOINTMENT_CANCELLED_CONTENT_SID: z.string().default('HX_CANCELLED_DEFAULT_SID'),

  RXFLOW_API_URL: z.string().default('http://localhost:5000'),
  RXFLOW_WHATSAPP_SERVICE_KEY: z.string().default('test-service-key-32-chars-long!!'),
});

export const env = envSchema.parse(process.env);
