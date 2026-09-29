import { z } from 'zod';
import { objectIdSchema } from '../../shared/validation.js';
import { communicationPurposes } from './communication-template.model.js';

export const whatsappConfigUpdateSchema = z.strictObject({
  adapter: z.enum(['cloud', 'sandbox']),
  apiVersion: z.string().regex(/^v\d+\.0$/).default('v26.0'),
  phoneNumberId: z.string().regex(/^\d{5,30}$/).optional(),
  whatsappBusinessAccountId: z.string().regex(/^\d{5,30}$/).optional(),
  accessToken: z.string().min(8).max(4096).optional(),
  appSecret: z.string().min(8).max(4096).optional(),
  verifyToken: z.string().min(8).max(4096).optional(),
  webhookKey: z.string().regex(/^[A-Za-z0-9_-]{24,120}$/).optional(),
}).superRefine((value, context) => {
  if (value.adapter === 'cloud') for (const field of ['phoneNumberId', 'whatsappBusinessAccountId', 'accessToken', 'appSecret', 'verifyToken'] as const) {
    if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: 'Required for the Cloud API adapter' });
  }
});

export const consentUpdateSchema = z.strictObject({
  status: z.enum(['opted_in', 'opted_out']),
  source: z.enum(['in_person', 'paper_form', 'website', 'whatsapp']),
  categories: z.array(z.enum(['appointments', 'prescription_ready'])).max(2).default([]),
}).refine((value) => value.status === 'opted_out' || value.categories.length > 0, { path: ['categories'], message: 'Choose at least one category for opt-in' });

export const templateCreateSchema = z.strictObject({
  name: z.string().regex(/^[a-z0-9_]{1,512}$/),
  language: z.string().trim().min(2).max(20),
  category: z.literal('utility'),
  purpose: z.enum(communicationPurposes),
  status: z.enum(['APPROVED', 'PAUSED', 'DISABLED', 'REJECTED', 'PENDING']),
  parameterFormat: z.enum(['named', 'positional']).default('named'),
  parameterNames: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)).max(10).default([]),
});
export const patientTimelineParamsSchema = z.strictObject({ patientId: objectIdSchema });
export const timelineQuerySchema = z.strictObject({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
export const alertQuerySchema = z.strictObject({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), unreadOnly: z.enum(['true', 'false']).transform((value) => value === 'true').default(false) });
export type WhatsappConfigUpdate = z.infer<typeof whatsappConfigUpdateSchema>;
export type ConsentUpdate = z.infer<typeof consentUpdateSchema>;
export type TemplateCreate = z.infer<typeof templateCreateSchema>;
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type AlertQuery = z.infer<typeof alertQuerySchema>;
