import { describe, it, expect, vi } from 'vitest';
import { PdfSpecialist } from '../src/specialists/pdf-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { openPdfPreviewCommandSchema, downloadClinicPdfCommandSchema } from '../src/ui-commands.js';

describe('Authoritative Prescription PDF Specialist (PROMPT 11)', () => {
  const specialist = new PdfSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_pdf_123',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: 'pat_pdf_123',
    boundQueueEntryId: 'q_pdf_123',
    sessionToken: 'token_pdf_123',
  };

  it('1. PDF for finalized prescription: serves PDF metadata for finalized prescription record', async () => {
    const result = await specialist.getPrescriptionPdf('rx_finalized_100', doctorContext);

    expect(result.success).toBe(true);
    expect(result.assistantText).toBe('The finalized prescription PDF is ready.');
    expect(result.pdfMetadata).toBeDefined();
    expect(result.pdfMetadata?.prescriptionId).toBe('rx_finalized_100');
    expect(result.pdfMetadata?.pdfUrl).toBe('/api/v1/prescriptions/rx_finalized_100/pdf');
    expect(result.pdfMetadata?.contentType).toBe('application/pdf');
    expect(result.pdfMetadata?.filename).toBe('RxFlow-Prescription-RXF-ED_100.pdf');
  });

  it('2. foreign-clinic denial: rejects PDF request with 403 when prescription belongs to another clinic', async () => {
    const foreignClinicFetcher = async () => ({
      exists: true,
      clinicId: 'clinic_beta', // Different clinic!
      status: 'finalized',
    });

    const result = await specialist.getPrescriptionPdf('rx_foreign_200', doctorContext, foreignClinicFetcher);

    expect(result.success).toBe(false);
    expect(result.error).toBe('FOREIGN_CLINIC_DENIAL');
    expect(result.statusCode).toBe(403);
    expect(result.assistantText).toContain('Access denied');
  });

  it('3. not-found: rejects PDF request with 404 when prescription ID does not exist', async () => {
    const notFoundFetcher = async () => ({
      exists: false,
      clinicId: 'clinic_alpha',
      status: 'finalized',
    });

    const result = await specialist.getPrescriptionPdf('rx_nonexistent_999', doctorContext, notFoundFetcher);

    expect(result.success).toBe(false);
    expect(result.error).toBe('NOT_FOUND');
    expect(result.statusCode).toBe(404);
    expect(result.assistantText).toContain('was not found');
  });

  it('4. download filename/content type: returns exact expected application/pdf headers and filename format', async () => {
    const mockFetcher = async () => ({
      exists: true,
      clinicId: 'clinic_alpha',
      friendlyId: 'RXF-A1B2C3',
      status: 'finalized',
      bufferLength: 20480,
    });

    const result = await specialist.getPrescriptionPdf('rx_sample_300', doctorContext, mockFetcher);

    expect(result.success).toBe(true);
    expect(result.pdfMetadata?.contentType).toBe('application/pdf');
    expect(result.pdfMetadata?.filename).toBe('RxFlow-Prescription-RXF-A1B2C3.pdf');
    expect(result.pdfMetadata?.fileSizeBytes).toBe(20480);
  });

  it('5. PDF generation failure: handles pdfkit error gracefully without corrupting database state', async () => {
    const failingFetcher = vi.fn().mockRejectedValue({
      statusCode: 500,
      code: 'PDFKIT_RENDER_ERROR',
      message: 'Failed to stream font metrics in PDFKit',
    });

    const result = await specialist.getPrescriptionPdf('rx_error_400', doctorContext, failingFetcher);

    expect(result.success).toBe(false);
    expect(result.error).toBe('PDFKIT_RENDER_ERROR');
    expect(result.statusCode).toBe(500);
    expect(result.assistantText).toContain('Failed to stream font metrics');
  });

  it('6. Jarvis truthful status: says "The finalized prescription PDF is ready" ONLY after backend confirmation', async () => {
    // Unfinalized prescription in draft state
    const unfinalizedFetcher = async () => ({
      exists: true,
      clinicId: 'clinic_alpha',
      status: 'draft',
    });

    const result = await specialist.getPrescriptionPdf('rx_draft_500', doctorContext, unfinalizedFetcher);

    expect(result.success).toBe(false);
    expect(result.assistantText).not.toContain('The finalized prescription PDF is ready.');
    expect(result.assistantText).toContain('must be finalized by doctor');
  });

  it('7. UI actions provided: returns OPEN_PDF_PREVIEW, DOWNLOAD_CLINIC_PDF, and OPEN_PRESCRIPTION_ACCESS', async () => {
    const result = await specialist.getPrescriptionPdf('rx_preview_600', doctorContext);

    expect(result.success).toBe(true);
    expect(result.uiCommands).toBeDefined();
    expect(result.uiCommands).toHaveLength(3);

    const previewCmd = result.uiCommands?.find((c) => c.type === 'OPEN_PDF_PREVIEW');
    expect(previewCmd).toBeDefined();
    expect(openPdfPreviewCommandSchema.safeParse(previewCmd).success).toBe(true);

    const downloadCmd = result.uiCommands?.find((c) => c.type === 'DOWNLOAD_CLINIC_PDF');
    expect(downloadCmd).toBeDefined();
    expect(downloadClinicPdfCommandSchema.safeParse(downloadCmd).success).toBe(true);

    const accessCmd = result.uiCommands?.find((c) => c.type === 'OPEN_PRESCRIPTION_ACCESS');
    expect(accessCmd).toBeDefined();
  });
});
