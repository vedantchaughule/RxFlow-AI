import { z } from 'zod';
import { objectIdSchema } from '../../shared/validation.js';

const scheduledAtSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value)).refine((value) => !Number.isNaN(value.getTime()) && value.getTime() > Date.now(), 'Appointment must be scheduled in the future');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Must be a valid date');

export const appointmentCreateSchema = z.strictObject({
  patientId: objectIdSchema,
  doctorId: objectIdSchema,
  scheduledAt: scheduledAtSchema,
  durationMinutes: z.number().int().min(5).max(120).default(15),
});
export const appointmentListQuerySchema = z.strictObject({
  date: dateSchema.optional(),
  doctorId: objectIdSchema.optional(),
  status: z.enum(['confirmed', 'pending', 'rescheduled', 'cancelled', 'completed', 'no_show']).optional(),
});
export const appointmentSlotsQuerySchema = z.strictObject({ doctorId: objectIdSchema, date: dateSchema });
export const appointmentIdParamsSchema = z.strictObject({ appointmentId: objectIdSchema });
export const appointmentStatusSchema = z.strictObject({ status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']) });

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;
export type AppointmentSlotsQuery = z.infer<typeof appointmentSlotsQuerySchema>;
export type AppointmentStatusInput = z.infer<typeof appointmentStatusSchema>;
