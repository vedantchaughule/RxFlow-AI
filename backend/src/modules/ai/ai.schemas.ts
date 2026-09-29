import { z } from 'zod';

export const medicineDraftSchema = z.strictObject({
  inventoryMedicineId: z.string().trim().max(100).nullable().optional(),
  stockWarning: z.string().trim().max(300).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(120).default(''),
  frequency: z.string().trim().max(200).default(''),
  duration: z.string().trim().max(120).default(''),
  instructions: z.string().trim().max(500).default(''),
});

export const aiDraftSchema = z.strictObject({
  diagnosis: z.string().trim().max(1000).default(''),
  doctorNotes: z.string().trim().max(2000).default(''),
  medicines: z.array(medicineDraftSchema).max(20).default([]),
  patientInstructions: z.string().trim().max(2000).default(''),
  missingFields: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  conflicts: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  safetyWarnings: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  insufficientContext: z.boolean(),
}).superRefine((value, context) => {
  const claimsCertainty = /\b(definite(?:ly)?|certain(?:ly)?|guarantee(?:d)?|cure[sd]?)\b/i.test(`${value.diagnosis} ${value.patientInstructions}`);
  if (claimsCertainty && value.safetyWarnings.length === 0) context.addIssue({ code: 'custom', path: ['safetyWarnings'], message: 'Certainty or cure claims require an explicit safety warning' });
});

export const aiHistorySummarySchema = z.strictObject({
  summary: z.string().trim().min(1).max(3000),
  limitations: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  insufficientContext: z.boolean(),
});

export const aiAssistBodySchema = z.strictObject({
  task: z.enum(['structured_draft', 'complete_fields', 'improve_instructions', 'check_conflicts']),
  notes: z.string().trim().min(1).max(6000),
  patientId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  draft: z.strictObject({
    diagnosis: z.string().trim().max(1000).default(''),
    doctorNotes: z.string().trim().max(2000).default(''),
    medicines: z.array(medicineDraftSchema).max(20).default([]),
  }).optional(),
});

export const aiHistoryBodySchema = z.strictObject({ patientId: z.string().regex(/^[a-f\d]{24}$/i) });
export const aiRejectParamsSchema = z.strictObject({ runId: z.string().regex(/^[a-f\d]{24}$/i) });
export const aiRejectBodySchema = z.strictObject({ reason: z.enum(['unsafe', 'incorrect', 'irrelevant', 'incomplete', 'other']) });

export type AiDraft = z.infer<typeof aiDraftSchema>;
export type AiAssistBody = z.infer<typeof aiAssistBodySchema>;
export type AiHistorySummary = z.infer<typeof aiHistorySummarySchema>;
