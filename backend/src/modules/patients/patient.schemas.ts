import { z } from 'zod';
import { objectIdSchema } from '../../shared/validation.js';
import { queueStatuses } from './visit-queue.model.js';

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const patientCreateSchema = z.strictObject({
  name: z.string().trim().min(2).max(160),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Must be an E.164 phone number'),
  age: z.number().int().min(1).max(120),
  gender: z.enum(['male', 'female', 'other']),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  chiefComplaint: z.string().trim().min(1).max(1000),
  assignedDoctorId: objectIdSchema,
});

export const patientListQuerySchema = z.strictObject({
  ...paginationFields,
  search: z.string().trim().min(2).max(160).optional(),
  match: z.enum(['exact', 'prefix']).default('exact'),
  doctorId: objectIdSchema.optional(),
});

export const patientIdParamsSchema = z.strictObject({ patientId: objectIdSchema });
export const patientFollowUpSchema = z.strictObject({
  followupDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Must be a valid date').nullable(),
});
export const patientHistoryQuerySchema = z.strictObject({ ...paginationFields });
export const patientQrParamsSchema = z.strictObject({ qrToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid QR token') });
export const queueEntryParamsSchema = z.strictObject({ queueEntryId: objectIdSchema });
export const patientCheckInSchema = z.strictObject({ doctorId: objectIdSchema.optional() });
export const queueStatusUpdateSchema = z.strictObject({ status: z.enum(queueStatuses) });
export const queueListQuerySchema = z.strictObject({
  ...paginationFields,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  doctorId: objectIdSchema.optional(),
  status: z.enum(queueStatuses).optional(),
});

export type PatientCreateInput = z.infer<typeof patientCreateSchema>;
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;
export type PatientCheckInInput = z.infer<typeof patientCheckInSchema>;
export type PatientHistoryQuery = z.infer<typeof patientHistoryQuerySchema>;
export type QueueListQuery = z.infer<typeof queueListQuerySchema>;
export type PatientFollowUpInput = z.infer<typeof patientFollowUpSchema>;
