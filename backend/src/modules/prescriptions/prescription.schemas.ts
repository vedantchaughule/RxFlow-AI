import { z } from 'zod';
import { objectIdSchema } from '../../shared/validation.js';

const medicineSchema = z.strictObject({
  inventoryMedicineId: objectIdSchema.nullable().optional(),
  stockWarning: z.string().trim().max(300).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(120),
  frequency: z.string().trim().min(1).max(200),
  duration: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(500).default(''),
});

export const prescriptionCreateSchema = z.strictObject({
  patientId: objectIdSchema,
  queueEntryId: objectIdSchema,
  diagnosis: z.string().trim().min(2).max(1000),
  doctorNotes: z.string().trim().max(2000).default(''),
  medicines: z.array(medicineSchema).min(1).max(20),
  clinicianConfirmed: z.literal(true, { error: 'Clinician confirmation is required' }),
});

export const prescriptionIdParamsSchema = z.strictObject({ prescriptionId: objectIdSchema });
export const shareLinkIdParamsSchema = z.strictObject({
  prescriptionId: objectIdSchema,
  shareLinkId: objectIdSchema,
});
export const publicPrescriptionTokenParamsSchema = z.strictObject({
  token: z.string().trim().min(20).max(128),
});
export const prescriptionListQuerySchema = z.strictObject({
  patientId: objectIdSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PrescriptionCreateInput = z.infer<typeof prescriptionCreateSchema>;
export type PrescriptionListQuery = z.infer<typeof prescriptionListQuerySchema>;

