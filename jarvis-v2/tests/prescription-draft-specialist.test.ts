import { describe, it, expect } from 'vitest';
import { PrescriptionDraftSpecialist } from '../src/specialists/prescription-draft-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { applyPrescriptionDraftFieldsCommandSchema } from '../src/ui-commands.js';
import type { PrescriptionDraft } from '../src/types.js';

describe('Prescription Manual-Entry Bridge & Auto-Fill Specialist (PROMPT 08)', () => {
  const specialist = new PrescriptionDraftSpecialist();

  const validActiveContext: ToolExecutionContext = {
    sessionId: 'sess_doc_rx_123',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: 'pat_bound_123',
    boundQueueEntryId: 'q_active_123',
    sessionToken: 'token_doc_rx',
  };

  const sampleIncomingDraft: PrescriptionDraft = {
    diagnosis: 'Acute Pharyngitis',
    doctorNotes: 'Gargle with warm salt water',
    medicines: [
      { name: 'Amoxicillin', dosage: '500mg', frequency: 'thrice daily', duration: '5 days', instructions: 'after food' },
      { name: 'Paracetamol', dosage: '650mg', frequency: 'as needed', duration: '3 days', instructions: 'after food' },
    ],
    missingFields: [],
    warnings: [],
  };

  it('1. manual fields preserved: existing non-empty doctor fields are preserved during draft merge', () => {
    const existingManualDraft: Partial<PrescriptionDraft> = {
      diagnosis: 'Doctor Manual Diagnosis - Severe Allergy',
      doctorNotes: 'Doctor Manual Notes - Avoid Aspirin',
      medicines: [
        { name: 'Cetirizine', dosage: '10mg', frequency: 'once daily', duration: '7 days', instructions: 'at bedtime' },
      ],
    };

    const { mergedDraft, preservedFields } = specialist.mergeDrafts(existingManualDraft, sampleIncomingDraft);

    expect(mergedDraft.diagnosis).toBe('Doctor Manual Diagnosis - Severe Allergy');
    expect(mergedDraft.doctorNotes).toBe('Doctor Manual Notes - Avoid Aspirin');
    expect(preservedFields).toContain('diagnosis');
    expect(preservedFields).toContain('doctorNotes');

    // Existing Cetirizine should remain, Amoxicillin & Paracetamol appended
    expect(mergedDraft.medicines).toHaveLength(3);
    expect(mergedDraft.medicines[0]?.name).toBe('Cetirizine');
    expect(mergedDraft.medicines[1]?.name).toBe('Amoxicillin');
    expect(mergedDraft.medicines[2]?.name).toBe('Paracetamol');
  });

  it('2. empty Jarvis fields do not erase values: empty incoming draft fields leave manual form intact', () => {
    const existingManualDraft: Partial<PrescriptionDraft> = {
      diagnosis: 'Doctor Preserved Diagnosis',
      doctorNotes: 'Doctor Preserved Notes',
      medicines: [
        { name: 'Ibuprofen', dosage: '400mg', frequency: 'twice daily', duration: '3 days', instructions: 'after food' },
      ],
    };

    const emptyIncomingDraft: PrescriptionDraft = {
      diagnosis: '',
      doctorNotes: '',
      medicines: [
        { name: 'Ibuprofen', dosage: '', frequency: '', duration: '', instructions: '' },
      ],
      missingFields: [],
      warnings: [],
    };

    const { mergedDraft } = specialist.mergeDrafts(existingManualDraft, emptyIncomingDraft);

    expect(mergedDraft.diagnosis).toBe('Doctor Preserved Diagnosis');
    expect(mergedDraft.doctorNotes).toBe('Doctor Preserved Notes');
    expect(mergedDraft.medicines[0]?.dosage).toBe('400mg');
    expect(mergedDraft.medicines[0]?.frequency).toBe('twice daily');
  });

  it('3. patient binding required: rejects applying draft if boundPatientId is missing', () => {
    const unboundPatientContext: ToolExecutionContext = {
      ...validActiveContext,
      boundPatientId: null,
    };

    const result = specialist.applyDraft(null, sampleIncomingDraft, unboundPatientContext);

    expect(result.error).toBe('PATIENT_NOT_BOUND');
    expect(result.statusCode).toBe(400);
    expect(result.uiCommand).toBeUndefined();
  });

  it('4. stale patient rejected: rejects applying draft if boundQueueEntryId is missing', () => {
    const unboundQueueContext: ToolExecutionContext = {
      ...validActiveContext,
      boundQueueEntryId: null,
    };

    const result = specialist.applyDraft(null, sampleIncomingDraft, unboundQueueContext);

    expect(result.error).toBe('ACTIVE_VISIT_NOT_BOUND');
    expect(result.statusCode).toBe(400);
    expect(result.uiCommand).toBeUndefined();
  });

  it('5. duplicate medicine handling: updates missing fields of matching medicine without duplicating entry', () => {
    const existingManualDraft: Partial<PrescriptionDraft> = {
      diagnosis: '',
      doctorNotes: '',
      medicines: [
        { name: 'Paracetamol', dosage: '500mg', frequency: '', duration: '', instructions: '' },
      ],
    };

    const incomingWithDuplicates: PrescriptionDraft = {
      diagnosis: 'Fever',
      doctorNotes: '',
      medicines: [
        { name: 'Paracetamol', dosage: '500mg', frequency: 'twice daily', duration: '5 days', instructions: 'after food' },
        { name: 'Azithromycin', dosage: '500mg', frequency: 'once daily', duration: '3 days', instructions: 'before food' },
      ],
      missingFields: [],
      warnings: [],
    };

    const { mergedDraft } = specialist.mergeDrafts(existingManualDraft, incomingWithDuplicates);

    // Paracetamol should be updated in-place (not duplicated)
    expect(mergedDraft.medicines).toHaveLength(2);
    expect(mergedDraft.medicines[0]?.name).toBe('Paracetamol');
    expect(mergedDraft.medicines[0]?.frequency).toBe('twice daily');
    expect(mergedDraft.medicines[0]?.duration).toBe('5 days');
    expect(mergedDraft.medicines[1]?.name).toBe('Azithromycin');
  });

  it('6. dictation parsing: parses raw doctor dictation text into structured draft', () => {
    const dictationText = 'Diagnosis: Acute Bronchitis. Tab Amoxicillin 500mg twice daily for 5 days after food';

    const parsedDraft = specialist.parseDictationToDraft(dictationText);

    expect(parsedDraft.diagnosis).toBe('Acute Bronchitis');
    expect(parsedDraft.medicines).toHaveLength(1);
    expect(parsedDraft.medicines[0]?.name).toBe('Amoxicillin');
    expect(parsedDraft.medicines[0]?.dosage).toBe('500mg');
    expect(parsedDraft.medicines[0]?.frequency).toBe('twice daily');
    expect(parsedDraft.medicines[0]?.duration).toBe('5 days');
    expect(parsedDraft.medicines[0]?.instructions).toBe('after food');
  });

  it('7. provider failure leaves manual form intact: returns error and does not emit UI command', () => {
    const existingManualDraft: Partial<PrescriptionDraft> = {
      diagnosis: 'Pre-existing Manual Form Content',
      medicines: [{ name: 'Metformin', dosage: '500mg', frequency: 'twice daily', duration: '30 days', instructions: 'with food' }],
    };

    // Simulate provider failure by supplying invalid context (missing patient binding)
    const result = specialist.applyDraft(existingManualDraft, sampleIncomingDraft, {
      ...validActiveContext,
      boundPatientId: null,
    });

    expect(result.error).toBe('PATIENT_NOT_BOUND');
    expect(result.uiCommand).toBeUndefined();
    expect(existingManualDraft.diagnosis).toBe('Pre-existing Manual Form Content');
    expect(existingManualDraft.medicines?.[0]?.name).toBe('Metformin');
  });

  it('8. emits APPLY_PRESCRIPTION_DRAFT_FIELDS UI command with isJarvisAssisted and resetFinalApproval', () => {
    const result = specialist.applyDraft(null, sampleIncomingDraft, validActiveContext);

    expect(result.uiCommand).toBeDefined();
    expect(result.uiCommand?.type).toBe('APPLY_PRESCRIPTION_DRAFT_FIELDS');

    const parsedCmd = applyPrescriptionDraftFieldsCommandSchema.safeParse(result.uiCommand);
    expect(parsedCmd.success).toBe(true);
    if (parsedCmd.success) {
      expect(parsedCmd.data.patientId).toBe('pat_bound_123');
      expect(parsedCmd.data.queueEntryId).toBe('q_active_123');
      expect(parsedCmd.data.isJarvisAssisted).toBe(true);
      expect(parsedCmd.data.resetFinalApproval).toBe(true);
    }
  });
});
