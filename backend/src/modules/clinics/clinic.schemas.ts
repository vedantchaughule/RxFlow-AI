import { z } from 'zod';

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must use 24-hour HH:mm format');
const optionalText = (max: number) => z.string().trim().max(max);
const optionalUrl = z.union([z.literal(''), z.url().max(2048)]);
const optionalPhone = z.union([z.literal(''), z.string().regex(/^\+[1-9]\d{7,14}$/, 'Must be an E.164 phone number')]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a six-digit hex colour').transform((value) => value.toLowerCase());

function contrastWithWhite(value: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return 1.05 / (luminance + 0.05);
}

const accessibleColor = hexColor.refine((value) => contrastWithWhite(value) >= 4.5, 'Colour must have at least 4.5:1 contrast with white text');
const passwordPolicySchema = z.strictObject({
  minLength: z.number().int().min(12).max(128),
  requireUppercase: z.boolean(),
  requireLowercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSymbol: z.boolean(),
});

function minutes(value: string): number {
  const [hours = '0', mins = '0'] = value.split(':');
  return Number(hours) * 60 + Number(mins);
}

export const workingHoursSchema = z.strictObject({
  start: timeSchema,
  end: timeSchema,
  breakStart: timeSchema,
  breakEnd: timeSchema,
}).superRefine((value, context) => {
  const start = minutes(value.start);
  const end = minutes(value.end);
  const breakStart = minutes(value.breakStart);
  const breakEnd = minutes(value.breakEnd);
  if (start >= end) context.addIssue({ code: 'custom', path: ['end'], message: 'End time must be after start time' });
  if (breakStart >= breakEnd) context.addIssue({ code: 'custom', path: ['breakEnd'], message: 'Break end must be after break start' });
  if (breakStart < start || breakEnd > end) context.addIssue({ code: 'custom', path: ['breakStart'], message: 'Break must fall within working hours' });
});

export const clinicSettingsUpdateSchema = z.strictObject({
  name: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional(),
  address: optionalText(500).optional(),
  city: optionalText(120).optional(),
  state: optionalText(120).optional(),
  phone: optionalPhone.optional(),
  logoUrl: optionalUrl.optional(),
  branding: z.strictObject({
    primaryColor: accessibleColor,
    accentColor: accessibleColor,
  }).optional(),
  passwordPolicy: passwordPolicySchema.optional(),
  registrationNumber: optionalText(120).optional(),
  workingHours: workingHoursSchema.optional(),
  maxPatientsPerHour: z.number().int().min(1).max(60).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one setting is required' });

export const aiConfigUpdateSchema = z.strictObject({
  provider: z.enum(['openai', 'gemini', 'anthropic']),
  baseUrl: z.url().max(2048).refine((value) => new URL(value).protocol === 'https:', 'Base URL must use HTTPS'),
  modelName: z.string().trim().min(1).max(160),
  apiKey: z.string().min(8).max(4096),
  enabled: z.boolean().default(false),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
  maxContextVisits: z.number().int().min(1).max(10).default(5),
});

export const aiControlsUpdateSchema = z.strictObject({
  enabled: z.boolean(),
  killSwitch: z.boolean(),
  timeoutMs: z.number().int().min(1000).max(30000),
  maxContextVisits: z.number().int().min(1).max(10),
});

export const auditListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.enum(['clinic.settings_updated', 'clinic.logo_updated', 'clinic.ai_config_updated', 'clinic.ai_controls_updated', 'clinic.whatsapp_config_updated', 'communication.template_registered', 'staff.created', 'staff.active', 'staff.disabled', 'staff.password_reset', 'appointment.created', 'appointment.status_updated', 'appointment.board_viewed']).optional(),
});

export type ClinicSettingsUpdate = z.infer<typeof clinicSettingsUpdateSchema>;
export type AiConfigUpdate = z.infer<typeof aiConfigUpdateSchema>;
export type AiControlsUpdate = z.infer<typeof aiControlsUpdateSchema>;
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
