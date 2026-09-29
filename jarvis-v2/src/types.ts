import { z } from 'zod';

export const MAX_INPUT_LENGTH = 2000;
export const MAX_TOOL_STEPS = 3;
export const DEFAULT_TIMEOUT_MS = 10000;

export const medicineItemSchema = z.strictObject({
  name: z.string().min(1).max(200),
  dosage: z.string().max(120).default(''),
  frequency: z.string().max(200).default(''),
  duration: z.string().max(120).default(''),
  instructions: z.string().max(500).default(''),
});
export type MedicineItem = z.infer<typeof medicineItemSchema>;

export const prescriptionDraftSchema = z.strictObject({
  diagnosis: z.string().max(1000).default(''),
  doctorNotes: z.string().max(2000).default(''),
  medicines: z.array(medicineItemSchema).min(1).max(20),
  missingFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type PrescriptionDraft = z.infer<typeof prescriptionDraftSchema>;

export const intentSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('patient_lookup'),
    query: z.string(),
    lookupType: z.enum(['auto', 'patient_id', 'name', 'queue_number']),
  }),
  z.strictObject({
    kind: z.literal('queue'),
    mode: z.enum(['remaining', 'next', 'current', 'list']),
  }),
  z.strictObject({
    kind: z.literal('inventory_search'),
    query: z.string(),
  }),
  z.strictObject({
    kind: z.literal('low_stock'),
  }),
  z.strictObject({
    kind: z.literal('patient_context'),
  }),
  z.strictObject({
    kind: z.literal('recent_prescriptions'),
  }),
  z.strictObject({
    kind: z.literal('communication_status'),
  }),
  z.strictObject({
    kind: z.literal('prescription_draft'),
    draft: prescriptionDraftSchema,
  }),
  z.strictObject({
    kind: z.literal('add_inventory_to_draft'),
    query: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('mutate_inventory_stock'),
    mode: z.enum(['increase', 'decrease', 'set']),
    amount: z.number(),
    query: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('today_appointments'),
    date: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('next_appointment'),
  }),
  z.strictObject({
    kind: z.literal('appointment_status'),
    patientId: z.string().optional(),
    appointmentId: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('draft_appointment'),
    date: z.string().optional(),
    time: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('mutate_appointment'),
    action: z.enum(['create', 'reschedule', 'cancel', 'confirm']),
    appointmentId: z.string().optional(),
    scheduledAt: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('reminder_status'),
    appointmentId: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('draft_communication'),
    templateName: z.string().optional(),
    parameters: z.record(z.string(), z.string()).optional(),
  }),
  z.strictObject({
    kind: z.literal('mutate_communication'),
    patientId: z.string().optional(),
    templateName: z.string().optional(),
    parameters: z.record(z.string(), z.string()).optional(),
  }),
  z.strictObject({
    kind: z.literal('list_templates'),
  }),
  z.strictObject({
    kind: z.literal('use_template'),
    templateName: z.string().optional(),
    templateId: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('fill_blank_template'),
  }),
  z.strictObject({
    kind: z.literal('save_draft_template'),
    title: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('patients_seen_today'),
  }),
  z.strictObject({
    kind: z.literal('patients_waiting'),
  }),
  z.strictObject({
    kind: z.literal('operational_summary'),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('greeting'),
  }),
  z.strictObject({
    kind: z.literal('prepare_patient_access'),
  }),
  z.strictObject({
    kind: z.literal('access_status'),
  }),
  z.strictObject({
    kind: z.literal('database_info'),
  }),
  z.strictObject({
    kind: z.literal('web_search'),
    query: z.string(),
  }),
  z.strictObject({
    kind: z.literal('help'),
  }),
  z.strictObject({
    kind: z.literal('unknown'),
  }),
]);

export type Intent = z.infer<typeof intentSchema>;

export const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'patient_lookup', 'queue', 'inventory_search', 'low_stock',
        'add_inventory_to_draft', 'mutate_inventory_stock',
        'today_appointments', 'next_appointment', 'appointment_status',
        'draft_appointment', 'mutate_appointment',
        'patient_context', 'recent_prescriptions', 'communication_status',
        'prescription_draft', 'greeting', 'prepare_patient_access',
        'access_status', 'database_info', 'web_search', 'help', 'unknown',
      ],
    },
    query: { type: 'string' },
    lookupType: { type: 'string', enum: ['auto', 'patient_id', 'name', 'queue_number'] },
    mode: { type: 'string' },
    amount: { type: 'number' },
    draft: {
      type: 'object',
      properties: {
        diagnosis: { type: 'string' },
        doctorNotes: { type: 'string' },
        medicines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              dosage: { type: 'string' },
              frequency: { type: 'string' },
              duration: { type: 'string' },
              instructions: { type: 'string' },
            },
            required: ['name', 'dosage', 'frequency', 'duration', 'instructions'],
          },
        },
        missingFields: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['diagnosis', 'doctorNotes', 'medicines', 'missingFields', 'warnings'],
    },
  },
  required: ['kind'],
};

export type ProviderType = 'none' | 'openai' | 'gemini';

export type ProviderInput = {
  message: string;
  contextHint?: string;
};

export type ProviderOutput = {
  intent: Intent;
  assistantText?: string;
  rawConfidence?: number;
  providerName: ProviderType;
};
