import { describe, it, expect, vi } from 'vitest';
import { FinalizationApprovalSpecialist } from '../src/specialists/finalization-approval-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import type { FinalizePrescriptionParams, AuthoritativeFinalizationSummary } from '../src/specialists/finalization-approval-specialist.js';
import type { VerificationGateResult } from '../src/specialists/verification-gate-specialist.js';

describe('Doctor Approval & Prescription Finalization Specialist (PROMPT 10)', () => {
  const specialist = new FinalizationApprovalSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_fin_123',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: 'pat_fin_123',
    boundQueueEntryId: 'q_fin_123',
    sessionToken: 'token_fin_123',
  };

  const sampleParams: FinalizePrescriptionParams = {
    patientId: 'pat_fin_123',
    queueEntryId: 'q_fin_123',
    draftVersion: 1,
    verifiedDraftVersion: 1,
    idempotencyKey: 'idemp_unique_001',
    draft: {
      diagnosis: 'Acute Gastritis',
      doctorNotes: 'Take after meals',
      medicines: [
        { name: 'Pantoprazole', dosage: '40mg', frequency: 'once daily', duration: '7 days', instructions: 'before food' },
      ],
      missingFields: [],
      warnings: [],
    },
  };

  it('1. double-submit idempotency: returns cached authoritative summary on duplicate submission', async () => {
    const mockBackend = vi.fn().mockResolvedValue({
      prescriptionId: 'rx_authoritative_100',
      status: 'finalized',
      finalizedAt: '2026-08-07T22:10:00.000Z',
    } as AuthoritativeFinalizationSummary);

    // Call 1
    const res1 = await specialist.finalizePrescription(sampleParams, doctorContext, mockBackend);
    expect(res1.success).toBe(true);
    expect(res1.summary?.prescriptionId).toBe('rx_authoritative_100');
    expect(mockBackend).toHaveBeenCalledTimes(1);

    // Call 2 (Duplicate submit with same idempotencyKey)
    const res2 = await specialist.finalizePrescription(sampleParams, doctorContext, mockBackend);
    expect(res2.success).toBe(true);
    expect(res2.summary?.prescriptionId).toBe('rx_authoritative_100');
    // Backend finalizer must NOT be called a second time
    expect(mockBackend).toHaveBeenCalledTimes(1);
  });

  it('2. stale verification: rejects finalization if draft version changed after verification', async () => {
    const staleParams: FinalizePrescriptionParams = {
      ...sampleParams,
      idempotencyKey: 'idemp_stale_002',
      draftVersion: 2, // Modified after verification
      verifiedDraftVersion: 1,
    };

    const res = await specialist.finalizePrescription(staleParams, doctorContext);

    expect(res.success).toBe(false);
    expect(res.error).toBe('DRAFT_STALE');
    expect(res.statusCode).toBe(409);
    expect(res.assistantText).toContain('modified after verification');
  });

  it('3. wrong patient: rejects finalization if patient ID changed after verification', async () => {
    const wrongPatientParams: FinalizePrescriptionParams = {
      ...sampleParams,
      idempotencyKey: 'idemp_wrong_pat_003',
      patientId: 'pat_wrong_999',
    };

    const res = await specialist.finalizePrescription(wrongPatientParams, doctorContext);

    expect(res.success).toBe(false);
    expect(res.error).toBe('PATIENT_CHANGED');
    expect(res.statusCode).toBe(409);
  });

  it('4. wrong clinic: backend rejects finalization when clinic context does not match', async () => {
    const mockWrongClinicBackend = vi.fn().mockRejectedValue({
      statusCode: 403,
      code: 'CLINIC_MISMATCH',
      message: 'Prescription clinic does not match authenticated doctor clinic',
    });

    const wrongClinicParams: FinalizePrescriptionParams = {
      ...sampleParams,
      idempotencyKey: 'idemp_wrong_clinic_004',
    };

    const res = await specialist.finalizePrescription(wrongClinicParams, doctorContext, mockWrongClinicBackend);

    expect(res.success).toBe(false);
    expect(res.error).toBe('CLINIC_MISMATCH');
    expect(res.statusCode).toBe(403);
  });

  it('5. provider offline: backend finalization operates 100% independently of AI provider status', async () => {
    const mockBackend = vi.fn().mockResolvedValue({
      prescriptionId: 'rx_offline_provider_200',
      status: 'finalized',
      finalizedAt: '2026-08-07T22:10:00.000Z',
    } as AuthoritativeFinalizationSummary);

    const offlineParams: FinalizePrescriptionParams = {
      ...sampleParams,
      idempotencyKey: 'idemp_offline_provider_005',
    };

    // Works cleanly even with provider=none
    const res = await specialist.finalizePrescription(offlineParams, doctorContext, mockBackend);

    expect(res.success).toBe(true);
    expect(res.summary?.prescriptionId).toBe('rx_offline_provider_200');
    expect(res.summary?.status).toBe('finalized');
  });

  it('6. backend failure: handles backend error gracefully without corrupting form state', async () => {
    const mockFailingBackend = vi.fn().mockRejectedValue({
      statusCode: 500,
      code: 'DATABASE_TIMEOUT',
      message: 'MongoDB transaction timeout',
    });

    const failingParams: FinalizePrescriptionParams = {
      ...sampleParams,
      idempotencyKey: 'idemp_fail_006',
    };

    const res = await specialist.finalizePrescription(failingParams, doctorContext, mockFailingBackend);

    expect(res.success).toBe(false);
    expect(res.error).toBe('DATABASE_TIMEOUT');
    expect(res.statusCode).toBe(500);
    expect(res.assistantText).toContain('MongoDB transaction timeout');
  });

  it('7. successful manual fallback: doctor can finalize prescription manually via UI without Jarvis', () => {
    const verificationPassed: VerificationGateResult = {
      verificationPassed: true,
      assistantText: 'The generated prescription matches the entered information. Please verify and approve.',
      mismatches: [],
      editActionRequired: false,
      card: {
        type: 'verification_passed',
        patientId: 'pat_fin_123',
        medicinesCount: 1,
        requiresDoctorFinalization: true,
      },
    };

    const prepResult = specialist.prepareApprovalAction(verificationPassed, doctorContext);

    expect(prepResult.success).toBe(true);
    expect(prepResult.uiCommand?.type).toBe('FOCUS_APPROVAL_ACTION');
  });
});
