import { z } from 'zod';
import { prescriptionDraftSchema } from './types.js';

export const openPatientCommandSchema = z.strictObject({
  type: z.literal('OPEN_PATIENT'),
  patientId: z.string().min(1),
  friendlyId: z.string().min(1),
  queueEntryId: z.string().optional(),
});
export type OpenPatientCommand = z.infer<typeof openPatientCommandSchema>;

export const showQueueCommandSchema = z.strictObject({
  type: z.literal('SHOW_QUEUE'),
  filter: z.enum(['all', 'waiting', 'in_consultation']).default('all'),
});
export type ShowQueueCommand = z.infer<typeof showQueueCommandSchema>;

export const applyPrescriptionDraftFieldsCommandSchema = z.strictObject({
  type: z.literal('APPLY_PRESCRIPTION_DRAFT_FIELDS'),
  patientId: z.string().min(1),
  queueEntryId: z.string().optional(),
  draft: prescriptionDraftSchema,
  mergedFields: z.array(z.string()),
  isJarvisAssisted: z.literal(true),
  resetFinalApproval: z.literal(true),
});
export type ApplyPrescriptionDraftFieldsCommand = z.infer<typeof applyPrescriptionDraftFieldsCommandSchema>;

export const focusApprovalActionCommandSchema = z.strictObject({
  type: z.literal('FOCUS_APPROVAL_ACTION'),
  patientId: z.string().min(1),
  queueEntryId: z.string().optional(),
});
export type FocusApprovalActionCommand = z.infer<typeof focusApprovalActionCommandSchema>;

export const openPdfPreviewCommandSchema = z.strictObject({
  type: z.literal('OPEN_PDF_PREVIEW'),
  prescriptionId: z.string().min(1),
  pdfUrl: z.string().min(1),
});
export type OpenPdfPreviewCommand = z.infer<typeof openPdfPreviewCommandSchema>;

export const downloadClinicPdfCommandSchema = z.strictObject({
  type: z.literal('DOWNLOAD_CLINIC_PDF'),
  prescriptionId: z.string().min(1),
  pdfUrl: z.string().min(1),
  filename: z.string().min(1),
});
export type DownloadClinicPdfCommand = z.infer<typeof downloadClinicPdfCommandSchema>;

export const showQrCommandSchema = z.strictObject({
  type: z.literal('SHOW_QR'),
  prescriptionId: z.string().min(1),
  qrTokenUrl: z.string().min(1),
  patientName: z.string().min(1),
  shareLinkId: z.string().optional(),
});
export type ShowQrCommand = z.infer<typeof showQrCommandSchema>;

export const downloadQrCommandSchema = z.strictObject({
  type: z.literal('DOWNLOAD_QR'),
  prescriptionId: z.string().min(1),
  qrCodeDataUrl: z.string().min(1),
  filename: z.string().min(1),
});
export type DownloadQrCommand = z.infer<typeof downloadQrCommandSchema>;

export const NAVIGATE_UI_COMMAND = 'NAVIGATE_UI';
export const APPLY_PRESCRIPTION_DRAFT_FIELDS_COMMAND = 'APPLY_PRESCRIPTION_DRAFT_FIELDS';
export const OPEN_APPOINTMENT_FORM_COMMAND = 'OPEN_APPOINTMENT_FORM';
export const OPEN_TEMPLATE_LIBRARY_COMMAND = 'OPEN_TEMPLATE_LIBRARY';

export const openAppointmentFormCommandSchema = z.strictObject({
  type: z.literal(OPEN_APPOINTMENT_FORM_COMMAND),
  patientId: z.string().optional(),
  scheduledAt: z.string().optional(),
  reason: z.string().optional(),
  slotValidated: z.boolean().optional().default(true),
});
export type OpenAppointmentFormCommand = z.infer<typeof openAppointmentFormCommandSchema>;

export const navigateUICommandSchema = z.strictObject({
  type: z.literal(NAVIGATE_UI_COMMAND),
  targetPath: z.string().min(1),
});
export type NavigateUICommand = z.infer<typeof navigateUICommandSchema>;

export const openTemplateLibraryCommandSchema = z.strictObject({
  type: z.literal(OPEN_TEMPLATE_LIBRARY_COMMAND),
});
export type OpenTemplateLibraryCommand = z.infer<typeof openTemplateLibraryCommandSchema>;

export const uiCommandSchema = z.discriminatedUnion('type', [
  openPatientCommandSchema,
  showQueueCommandSchema,
  applyPrescriptionDraftFieldsCommandSchema,
  focusApprovalActionCommandSchema,
  openPdfPreviewCommandSchema,
  downloadClinicPdfCommandSchema,
  showQrCommandSchema,
  downloadQrCommandSchema,
  navigateUICommandSchema,
  openTemplateLibraryCommandSchema,
  z.strictObject({
    type: z.literal('OPEN_PRESCRIPTION'),
    prescriptionId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal('FOCUS_MEDICINE_SEARCH'),
    initialQuery: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('APPLY_DRAFT_FIELDS'),
    draft: z.unknown(),
  }),
  z.strictObject({
    type: z.literal('OPEN_APPOINTMENT'),
    appointmentId: z.string().optional(),
  }),
  openAppointmentFormCommandSchema,
  z.strictObject({
    type: z.literal('OPEN_PRESCRIPTION_ACCESS'),
    prescriptionId: z.string().min(1),
    shareLinkId: z.string().optional(),
  }),
]);

export const crossTabMessageSchema = z.strictObject({
  version: z.string().min(1),
  commandId: z.string().min(1),
  tabId: z.string().min(1),
  sessionRef: z.string().min(1),
  patientQueueVersion: z.number(),
  commandType: z.enum([
    'NAVIGATE_UI',
    'APPLY_PRESCRIPTION_DRAFT_FIELDS',
    'OPEN_APPOINTMENT_FORM',
    'OPEN_TEMPLATE_LIBRARY',
  ]),
  payload: z.unknown(),
  timestamp: z.number(),
});
export type CrossTabMessage = z.infer<typeof crossTabMessageSchema>;

export type UICommand = z.infer<typeof uiCommandSchema>;

export function createOpenPatientCommand(patientId: string, friendlyId: string, queueEntryId?: string): OpenPatientCommand {
  return {
    type: 'OPEN_PATIENT',
    patientId,
    friendlyId,
    queueEntryId,
  };
}

export function createShowQueueCommand(filter: 'all' | 'waiting' | 'in_consultation' = 'all'): ShowQueueCommand {
  return {
    type: 'SHOW_QUEUE',
    filter,
  };
}

export function createApplyDraftCommand(
  patientId: string,
  queueEntryId: string | undefined,
  draft: z.infer<typeof prescriptionDraftSchema>,
  mergedFields: string[]
): ApplyPrescriptionDraftFieldsCommand {
  return {
    type: 'APPLY_PRESCRIPTION_DRAFT_FIELDS',
    patientId,
    queueEntryId,
    draft,
    mergedFields,
    isJarvisAssisted: true,
    resetFinalApproval: true,
  };
}

export function createFocusApprovalCommand(patientId: string, queueEntryId?: string): FocusApprovalActionCommand {
  return {
    type: 'FOCUS_APPROVAL_ACTION',
    patientId,
    queueEntryId,
  };
}

export function createOpenPdfPreviewCommand(prescriptionId: string, pdfUrl: string): OpenPdfPreviewCommand {
  return {
    type: 'OPEN_PDF_PREVIEW',
    prescriptionId,
    pdfUrl,
  };
}

export function createDownloadClinicPdfCommand(prescriptionId: string, pdfUrl: string, filename: string): DownloadClinicPdfCommand {
  return {
    type: 'DOWNLOAD_CLINIC_PDF',
    prescriptionId,
    pdfUrl,
    filename,
  };
}

export function createShowQrCommand(prescriptionId: string, qrTokenUrl: string, patientName: string, shareLinkId?: string): ShowQrCommand {
  return {
    type: 'SHOW_QR',
    prescriptionId,
    qrTokenUrl,
    patientName,
    shareLinkId,
  };
}

export function createDownloadQrCommand(prescriptionId: string, qrCodeDataUrl: string, filename: string): DownloadQrCommand {
  return {
    type: 'DOWNLOAD_QR',
    prescriptionId,
    qrCodeDataUrl,
    filename,
  };
}

export function createOpenAppointmentFormCommand(patientId?: string, scheduledAt?: string, reason?: string, slotValidated = true) {
  return {
    type: 'OPEN_APPOINTMENT_FORM' as const,
    patientId,
    scheduledAt,
    reason,
    slotValidated,
  };
}
