import { z } from 'zod';
import { objectIdSchema } from '../../shared/validation.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD').refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)),
  'Must be a valid date',
);

export const analyticsQuerySchema = z.strictObject({
  from: dateSchema,
  to: dateSchema,
  doctorId: objectIdSchema.optional(),
}).superRefine((value, context) => {
  const from = Date.parse(`${value.from}T00:00:00.000Z`);
  const to = Date.parse(`${value.to}T00:00:00.000Z`);
  if (to < from) context.addIssue({ code: 'custom', path: ['to'], message: 'To date must be on or after from date' });
  if ((to - from) / 86_400_000 > 365) context.addIssue({ code: 'custom', path: ['to'], message: 'Date range cannot exceed 366 days' });
});

export const dropoutQuerySchema = z.strictObject({
  asOf: dateSchema,
  doctorId: objectIdSchema.optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type DropoutQuery = z.infer<typeof dropoutQuerySchema>;
