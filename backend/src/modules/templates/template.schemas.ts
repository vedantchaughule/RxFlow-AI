import { z } from 'zod';

export const templateMedicineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  duration: z.string().trim().min(1).max(100),
  instructions: z.string().trim().max(500).optional().default(''),
});

export const createTemplateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  diagnosis: z.string().trim().min(2).max(1000),
  doctorNotes: z.string().trim().max(2000).optional().default(''),
  medicines: z.array(templateMedicineSchema).min(1),
});

export const updateTemplateSchema = createTemplateSchema.partial();
