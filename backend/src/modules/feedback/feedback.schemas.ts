import { z } from 'zod';
import { objectIdSchema } from '../../shared/validation.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Must be a valid date');
const safeCommentSchema = z.string().trim().max(1000).refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value), 'Comment contains unsupported control characters').refine((value) => (value.match(/https?:\/\//gi) ?? []).length <= 3, 'Comment contains too many links');

export const feedbackRequestSchema = z.strictObject({ appointmentId: objectIdSchema });
export const feedbackTokenParamsSchema = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid feedback token') });
export const feedbackSubmitSchema = z.strictObject({ consent: z.literal(true, { error: 'Consent is required' }), rating: z.number().int().min(1).max(5), comment: safeCommentSchema.optional() });
export const feedbackListQuerySchema = z.strictObject({
  from: dateSchema, to: dateSchema, doctorId: objectIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
}).superRefine((value, context) => {
  const from = Date.parse(`${value.from}T00:00:00.000Z`);
  const to = Date.parse(`${value.to}T00:00:00.000Z`);
  if (to < from) context.addIssue({ code: 'custom', path: ['to'], message: 'To date must be on or after from date' });
  if ((to - from) / 86_400_000 > 365) context.addIssue({ code: 'custom', path: ['to'], message: 'Date range cannot exceed 366 days' });
});

export type FeedbackRequestInput = z.infer<typeof feedbackRequestSchema>;
export type FeedbackSubmitInput = z.infer<typeof feedbackSubmitSchema>;
export type FeedbackListQuery = z.infer<typeof feedbackListQuerySchema>;
