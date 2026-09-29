import { describe, it, expect } from 'vitest';
import { PatientAccessSpecialist } from '../src/specialists/patient-access-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { showQrCommandSchema, downloadQrCommandSchema } from '../src/ui-commands.js';

describe('Patient Prescription Access & QR Specialist (PROMPT 12)', () => {
  const specialist = new PatientAccessSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_access_123',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: 'pat_rahul_123',
    boundQueueEntryId: 'q_access_123',
    sessionToken: 'token_access_123',
  };

  it('1. QR resolves to patient-mobile page: generates valid share link and SHOW_QR command', async () => {
    const res = await specialist.generatePatientQr('rx_access_100', doctorContext, 'Rahul Patil');

    expect(res.success).toBe(true);
    expect(res.assistantText).toBe('Patient prescription access QR code generated successfully.');
    expect(res.shareLink).toBeDefined();
    expect(res.shareLink?.url).toContain('http://localhost:5174/prescription/tok_');

    expect(res.uiCommands).toBeDefined();
    expect(res.uiCommands).toHaveLength(2);

    const showQrCmd = res.uiCommands?.find((c) => c.type === 'SHOW_QR');
    expect(showQrCmd).toBeDefined();
    expect(showQrCommandSchema.safeParse(showQrCmd).success).toBe(true);

    const downloadQrCmd = res.uiCommands?.find((c) => c.type === 'DOWNLOAD_QR');
    expect(downloadQrCmd).toBeDefined();
    expect(downloadQrCommandSchema.safeParse(downloadQrCmd).success).toBe(true);
  });

  it('2. no raw medical data in QR payload: URL contains opaque token ONLY, zero patient name/diagnosis/medicines', async () => {
    const res = await specialist.generatePatientQr('rx_access_200', doctorContext, 'Rahul Patil');
    const url = res.shareLink?.url || '';

    // Must NOT contain sensitive PII / clinical text in URL string
    expect(url).not.toContain('Rahul');
    expect(url).not.toContain('Patil');
    expect(url).not.toContain('diagnosis');
    expect(url).not.toContain('Paracetamol');
    expect(url).not.toContain('prescriptionId');

    // Contains only opaque token format
    expect(url).toMatch(/^http:\/\/localhost:5174\/prescription\/tok_[a-z0-9]+$/);
  });

  it('3. PDF download works on valid scan: patient mobile page resolves valid token cleanly', async () => {
    const genRes = await specialist.generatePatientQr('rx_access_300', doctorContext, 'Rahul Patil');
    const rawToken = genRes.shareLink!.token;

    const patientView = specialist.resolvePatientAccess(rawToken);

    expect(patientView.success).toBe(true);
    expect(patientView.prescriptionId).toBe('rx_access_300');
    expect(patientView.patientName).toBe('Rahul Patil');
    expect(patientView.canDownloadPdf).toBe(true);
    expect(patientView.pdfUrl).toBe(`/api/v1/public/prescriptions/${rawToken}/pdf`);
    expect(patientView.viewCount).toBe(1);
  });

  it('4. expired token: rejects resolution when current time is past expiresAt', async () => {
    const genRes = await specialist.generatePatientQr('rx_access_400', doctorContext);
    const rawToken = genRes.shareLink!.token;

    // Simulate scanning 50 hours later (past 48h TTL)
    const futureDate = new Date(Date.now() + 50 * 60 * 60 * 1000);
    const patientView = specialist.resolvePatientAccess(rawToken, futureDate);

    expect(patientView.success).toBe(false);
    expect(patientView.error).toBe('TOKEN_EXPIRED');
    expect(patientView.statusCode).toBe(410);
    expect(patientView.message).toContain('expired');
  });

  it('5. revoked token: rejects resolution when doctor manually revokes share link', async () => {
    const genRes = await specialist.generatePatientQr('rx_access_500', doctorContext);
    const shareLinkId = genRes.shareLink!.id;
    const rawToken = genRes.shareLink!.token;

    // Doctor revokes link
    const revokeRes = await specialist.revokeShareLink('rx_access_500', shareLinkId, doctorContext);
    expect(revokeRes.success).toBe(true);

    // Patient attempts to scan revoked link
    const patientView = specialist.resolvePatientAccess(rawToken);

    expect(patientView.success).toBe(false);
    expect(patientView.error).toBe('LINK_REVOKED');
    expect(patientView.statusCode).toBe(410);
    expect(patientView.message).toContain('revoked');
  });

  it('6. view limit: rejects resolution when view count exceeds maxViews limit', async () => {
    const genRes = await specialist.generatePatientQr('rx_access_600', doctorContext);
    const rawToken = genRes.shareLink!.token;

    // Simulate 10 valid views (maxViews = 10)
    for (let i = 0; i < 10; i++) {
      const view = specialist.resolvePatientAccess(rawToken);
      expect(view.success).toBe(true);
    }

    // 11th view attempt exceeds max limit
    const exceededView = specialist.resolvePatientAccess(rawToken);

    expect(exceededView.success).toBe(false);
    expect(exceededView.error).toBe('MAX_VIEWS_EXCEEDED');
    expect(exceededView.statusCode).toBe(410);
  });

  it('7. wrong/invalid token: rejects resolution when token does not exist', () => {
    const patientView = specialist.resolvePatientAccess('tok_invalid_bogus_999');

    expect(patientView.success).toBe(false);
    expect(patientView.error).toBe('INVALID_TOKEN');
    expect(patientView.statusCode).toBe(404);
  });

  it('8. replacement invalidates old link: issuing replacement link revokes the old token', async () => {
    const link1Res = await specialist.generatePatientQr('rx_access_800', doctorContext);
    const oldToken = link1Res.shareLink!.token;

    // Issue replacement link
    const replacementRes = await specialist.generateReplacementAccess('rx_access_800', doctorContext);
    const newToken = replacementRes.shareLink!.token;

    expect(oldToken).not.toBe(newToken);

    // Old token must be revoked
    const oldTokenView = specialist.resolvePatientAccess(oldToken);
    expect(oldTokenView.success).toBe(false);
    expect(oldTokenView.error).toBe('LINK_REVOKED');

    // New token must be active
    const newTokenView = specialist.resolvePatientAccess(newToken);
    expect(newTokenView.success).toBe(true);
  });

  it('9. show access status: returns active status timeline card', async () => {
    await specialist.generatePatientQr('rx_access_900', doctorContext);

    const statusRes = await specialist.getAccessStatus('rx_access_900', doctorContext);

    expect(statusRes.success).toBe(true);
    expect(statusRes.card?.hasActiveShareLink).toBe(true);
    expect(statusRes.card?.viewCount).toBe(0);
    expect(statusRes.card?.maxViews).toBe(10);
    expect(statusRes.card?.isRevoked).toBe(false);
  });
});
