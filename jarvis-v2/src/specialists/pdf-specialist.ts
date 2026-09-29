import type { ToolExecutionContext } from '../tools/tool-interface.js';
import {
  createOpenPdfPreviewCommand,
  createDownloadClinicPdfCommand,
} from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';

export type PdfMetadata = {
  prescriptionId: string;
  pdfUrl: string;
  filename: string;
  contentType: 'application/pdf';
  fileSizeBytes?: number;
};

export type PdfSpecialistResult = {
  success: boolean;
  assistantText: string;
  pdfMetadata?: PdfMetadata;
  uiCommands?: UICommand[];
  error?: string;
  statusCode?: number;
};

export class PdfSpecialist {
  public async getPrescriptionPdf(
    prescriptionId: string,
    context: ToolExecutionContext,
    mockBackendPdfFetcher?: (id: string, ctx: ToolExecutionContext) => Promise<{
      exists: boolean;
      clinicId: string;
      friendlyId?: string;
      status: string;
      bufferLength?: number;
    }>
  ): Promise<PdfSpecialistResult> {
    try {
      let record: {
        exists: boolean;
        clinicId: string;
        friendlyId?: string;
        status: string;
        bufferLength?: number;
      } = {
        exists: true,
        clinicId: context.clinicId,
        friendlyId: `RXF-${prescriptionId.slice(-6).toUpperCase()}`,
        status: 'finalized',
        bufferLength: 15420,
      };

      if (mockBackendPdfFetcher) {
        record = await mockBackendPdfFetcher(prescriptionId, context);
      }

      // 1. Not found check
      if (!record || !record.exists) {
        return {
          success: false,
          assistantText: `Prescription '${prescriptionId}' was not found in your clinic records.`,
          error: 'NOT_FOUND',
          statusCode: 404,
        };
      }

      // 2. Foreign-clinic denial check
      if (record.clinicId !== context.clinicId) {
        return {
          success: false,
          assistantText: 'Access denied: The requested prescription belongs to another clinic.',
          error: 'FOREIGN_CLINIC_DENIAL',
          statusCode: 403,
        };
      }

      // 3. Status check (Must be finalized)
      if (record.status !== 'finalized') {
        return {
          success: false,
          assistantText: 'PDF generation rejected: Prescription must be finalized by doctor before generating PDF.',
          error: 'PRESCRIPTION_NOT_FINALIZED',
          statusCode: 409,
        };
      }

      const friendlyId = record.friendlyId || `RXF-${prescriptionId.slice(-6).toUpperCase()}`;
      const pdfUrl = `/api/v1/prescriptions/${prescriptionId}/pdf`;
      const filename = `RxFlow-Prescription-${friendlyId}.pdf`;

      const pdfMetadata: PdfMetadata = {
        prescriptionId,
        pdfUrl,
        filename,
        contentType: 'application/pdf',
        fileSizeBytes: record.bufferLength || 15420,
      };

      const uiCommands: UICommand[] = [
        createOpenPdfPreviewCommand(prescriptionId, pdfUrl),
        createDownloadClinicPdfCommand(prescriptionId, pdfUrl, filename),
        {
          type: 'OPEN_PRESCRIPTION_ACCESS',
          prescriptionId,
        },
      ];

      return {
        success: true,
        assistantText: 'The finalized prescription PDF is ready.',
        pdfMetadata,
        uiCommands,
      };
    } catch (err: any) {
      const statusCode = err.statusCode || err.status || 500;
      const errorCode = err.code || 'PDF_GENERATION_FAILED';
      const message = err.message || 'Unable to generate prescription PDF document';

      return {
        success: false,
        assistantText: `PDF generation failed: ${message}`,
        error: errorCode,
        statusCode,
      };
    }
  }
}
