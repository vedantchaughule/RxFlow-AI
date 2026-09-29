import { describe, it, expect } from 'vitest';
import { VerificationGateSpecialist } from '../src/specialists/verification-gate-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import type { VerificationPayload } from '../src/specialists/verification-gate-specialist.js';

describe('Pre-Finalization Verification Gate Specialist (PROMPT 09)', () => {
  const specialist = new VerificationGateSpecialist();

  const mockContext: ToolExecutionContext = {
    sessionId: 'sess_verify_123',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: 'pat_verify_123',
    boundQueueEntryId: 'q_verify_123',
    sessionToken: 'token_verify',
  };

  const validSourcePayload: VerificationPayload = {
    patientId: 'pat_verify_123',
    queueEntryId: 'q_verify_123',
    draftVersion: 1,
    draft: {
      diagnosis: 'Acute Rhinitis',
      doctorNotes: 'Rest and fluids',
      medicines: [
        { name: 'Paracetamol', dosage: '500mg', frequency: 'twice daily', duration: '5 days', instructions: 'after food' },
        { name: 'Cetirizine', dosage: '10mg', frequency: 'once daily', duration: '5 days', instructions: 'at bedtime' },
      ],
      missingFields: [],
      warnings: [],
    },
  };

  it('1. match case: returns exact verification passed message and card when source and output match 100%', () => {
    const outputPayload = JSON.parse(JSON.stringify(validSourcePayload));

    const result = specialist.verify(validSourcePayload, outputPayload, mockContext);

    expect(result.verificationPassed).toBe(true);
    expect(result.assistantText).toBe('The generated prescription matches the entered information. Please verify and approve.');
    expect(result.mismatches).toHaveLength(0);
    expect(result.editActionRequired).toBe(false);
    expect(result.card.type).toBe('verification_passed');
  });

  it('2. patient mismatch: flags mismatch when output patientId differs from source or bound session', () => {
    const mismatchedOutput: VerificationPayload = {
      ...validSourcePayload,
      patientId: 'pat_wrong_999',
    };

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    expect(result.editActionRequired).toBe(true);
    expect(result.mismatches.some((m) => m.field === 'patientId')).toBe(true);
    expect(result.mismatches.some((m) => m.field === 'boundPatientId')).toBe(true);
  });

  it('3. queue entry mismatch: flags mismatch when queue entry ID differs', () => {
    const mismatchedOutput: VerificationPayload = {
      ...validSourcePayload,
      queueEntryId: 'q_wrong_999',
    };

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    expect(result.mismatches.some((m) => m.field === 'queueEntryId')).toBe(true);
  });

  it('4. medicine name mismatch: flags when medicine name in output does not match doctor entry', () => {
    const mismatchedOutput: VerificationPayload = JSON.parse(JSON.stringify(validSourcePayload));
    mismatchedOutput.draft.medicines[0]!.name = 'Ibuprofen'; // Was Paracetamol

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    expect(result.mismatches.some((m) => m.field === 'medicine:Paracetamol')).toBe(true);
    expect(result.mismatches.some((m) => m.field === 'medicine:Ibuprofen')).toBe(true);
  });

  it('5. dosage mismatch: flags when dosage differs (e.g. 500mg vs 250mg)', () => {
    const mismatchedOutput: VerificationPayload = JSON.parse(JSON.stringify(validSourcePayload));
    mismatchedOutput.draft.medicines[0]!.dosage = '250mg'; // Was 500mg

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    const dosageMismatch = result.mismatches.find((m) => m.field === 'medicine:Paracetamol.dosage');
    expect(dosageMismatch).toBeDefined();
    expect(dosageMismatch?.expected).toBe('500mg');
    expect(dosageMismatch?.found).toBe('250mg');
  });

  it('6. frequency mismatch: flags when frequency differs', () => {
    const mismatchedOutput: VerificationPayload = JSON.parse(JSON.stringify(validSourcePayload));
    mismatchedOutput.draft.medicines[0]!.frequency = 'thrice daily'; // Was twice daily

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    const freqMismatch = result.mismatches.find((m) => m.field === 'medicine:Paracetamol.frequency');
    expect(freqMismatch).toBeDefined();
    expect(freqMismatch?.expected).toBe('twice daily');
    expect(freqMismatch?.found).toBe('thrice daily');
  });

  it('7. duration mismatch: flags when duration differs', () => {
    const mismatchedOutput: VerificationPayload = JSON.parse(JSON.stringify(validSourcePayload));
    mismatchedOutput.draft.medicines[0]!.duration = '10 days'; // Was 5 days

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    const durMismatch = result.mismatches.find((m) => m.field === 'medicine:Paracetamol.duration');
    expect(durMismatch).toBeDefined();
    expect(durMismatch?.expected).toBe('5 days');
    expect(durMismatch?.found).toBe('10 days');
  });

  it('8. extra unexpected medicine: flags extra medicine in output missing from doctor entry', () => {
    const mismatchedOutput: VerificationPayload = JSON.parse(JSON.stringify(validSourcePayload));
    mismatchedOutput.draft.medicines.push({
      name: 'ExtraMedicine',
      dosage: '100mg',
      frequency: 'once daily',
      duration: '5 days',
      instructions: 'after food',
    });

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    const extraMismatch = result.mismatches.find((m) => m.field === 'medicine:ExtraMedicine');
    expect(extraMismatch).toBeDefined();
    expect(extraMismatch?.description).toContain('Unexpected extra medicine');
  });

  it('9. missing doctor-entered medicine: flags doctor-entered medicine omitted from output', () => {
    const mismatchedOutput: VerificationPayload = JSON.parse(JSON.stringify(validSourcePayload));
    mismatchedOutput.draft.medicines.pop(); // Remove Cetirizine

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    const missingMismatch = result.mismatches.find((m) => m.field === 'medicine:Cetirizine');
    expect(missingMismatch).toBeDefined();
    expect(missingMismatch?.description).toContain('Missing doctor-entered medicine');
  });

  it('10. stale draft version: flags version mismatch between form state and submitted payload', () => {
    const staleOutput: VerificationPayload = {
      ...validSourcePayload,
      draftVersion: 2, // Source is 1
    };

    const result = specialist.verify(validSourcePayload, staleOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    const versionMismatch = result.mismatches.find((m) => m.field === 'draftVersion');
    expect(versionMismatch).toBeDefined();
    expect(versionMismatch?.expected).toBe('1');
    expect(versionMismatch?.found).toBe('2');
  });

  it('11. no auto-correction: returns verificationPassed=false and requires doctor edit without mutating state', () => {
    const mismatchedOutput: VerificationPayload = JSON.parse(JSON.stringify(validSourcePayload));
    mismatchedOutput.draft.medicines[0]!.dosage = '999mg';

    const result = specialist.verify(validSourcePayload, mismatchedOutput, mockContext);

    expect(result.verificationPassed).toBe(false);
    expect(result.editActionRequired).toBe(true);
    expect(result.assistantText).toContain('verification failed');
    expect(result.card.type).toBe('verification_mismatch');
  });
});
