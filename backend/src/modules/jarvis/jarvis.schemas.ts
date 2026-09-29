import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const medicineSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(120).default(''),
  frequency: z.string().trim().max(200).default(''),
  duration: z.string().trim().max(120).default(''),
  instructions: z.string().trim().max(500).default(''),
});

export const prescriptionDraftSchema = z.strictObject({
  diagnosis: z.string().trim().max(1000).default(''),
  doctorNotes: z.string().trim().max(2000).default(''),
  medicines: z.array(medicineSchema).min(1).max(20),
  missingFields: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  warnings: z.array(z.string().trim().min(1).max(240)).max(50).default([]),
});

export const createJarvisSessionSchema = z.strictObject({ patientId: objectId.optional(), queueEntryId: objectId.optional() });
export const jarvisSessionParamsSchema = z.strictObject({ sessionId: z.string().uuid(), actionId: z.string().uuid() });
export const jarvisActionCancelParamsSchema = jarvisSessionParamsSchema;
export const jarvisSessionOnlyParamsSchema = z.strictObject({ sessionId: z.string().uuid() });

export const toolArgumentSchemas = {
  lookup_patient: z.strictObject({ query: z.string().trim().min(1).max(200), lookupType: z.enum(['auto', 'patient_id', 'name', 'queue_number']).default('auto') }),
  propose_patient_binding: z.strictObject({ patientId: objectId, queueEntryId: objectId.nullable().optional() }),
  get_patient_context: z.strictObject({}),
  get_queue_status: z.strictObject({ mode: z.enum(['remaining', 'next', 'current', 'list']).default('remaining'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  search_inventory: z.strictObject({ query: z.string().trim().min(1).max(200) }),
  get_low_stock: z.strictObject({}),
  get_recent_prescriptions: z.strictObject({ limit: z.coerce.number().int().min(1).max(5).default(3) }),
  get_communication_status: z.strictObject({ referenceId: objectId.optional() }),
  propose_prescription_draft: z.strictObject({ draft: prescriptionDraftSchema }),
} as const;

export type JarvisToolName = keyof typeof toolArgumentSchemas;

export const internalToolBodySchema = z.strictObject({
  sessionId: z.string().uuid(),
  toolName: z.enum([
    'lookup_patient',
    'propose_patient_binding',
    'get_patient_context',
    'get_queue_status',
    'search_inventory',
    'get_low_stock',
    'get_recent_prescriptions',
    'get_communication_status',
    'propose_prescription_draft',
  ]),
  arguments: z.record(z.string(), z.unknown()).default({}),
  requestId: z.string().uuid(),
});
