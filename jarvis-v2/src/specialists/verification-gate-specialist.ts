import type { ToolExecutionContext } from '../tools/tool-interface.js';
import type { PrescriptionDraft } from '../types.js';

export type MismatchField = {
  field: string;
  expected: string;
  found: string;
  description: string;
};

export type VerificationPayload = {
  patientId: string;
  queueEntryId?: string;
  draftVersion?: number;
  draft: PrescriptionDraft;
};

export type VerificationCard =
  | {
      type: 'verification_passed';
      patientId: string;
      medicinesCount: number;
      requiresDoctorFinalization: true;
    }
  | {
      type: 'verification_mismatch';
      patientId: string;
      mismatchesCount: number;
      mismatchedFields: MismatchField[];
      requiresDoctorEdit: true;
    };

export type VerificationGateResult = {
  verificationPassed: boolean;
  assistantText: string;
  mismatches: MismatchField[];
  editActionRequired: boolean;
  card: VerificationCard;
};

export class VerificationGateSpecialist {
  public verify(
    source: VerificationPayload,
    output: VerificationPayload,
    context: ToolExecutionContext
  ): VerificationGateResult {
    const mismatches: MismatchField[] = [];

    // 1. Patient Binding & Identity Verification
    if (source.patientId !== output.patientId) {
      mismatches.push({
        field: 'patientId',
        expected: source.patientId,
        found: output.patientId,
        description: 'Patient ID mismatch between entered form and generated document',
      });
    }

    if (context.boundPatientId && output.patientId !== context.boundPatientId) {
      mismatches.push({
        field: 'boundPatientId',
        expected: context.boundPatientId,
        found: output.patientId,
        description: 'Generated prescription patient ID does not match active bound session patient',
      });
    }

    // 2. Active Visit Queue Entry Verification
    if ((source.queueEntryId || '') !== (output.queueEntryId || '')) {
      mismatches.push({
        field: 'queueEntryId',
        expected: source.queueEntryId || 'none',
        found: output.queueEntryId || 'none',
        description: 'Active visit queue entry mismatch between source and output',
      });
    }

    if (context.boundQueueEntryId && (output.queueEntryId || '') !== context.boundQueueEntryId) {
      mismatches.push({
        field: 'boundQueueEntryId',
        expected: context.boundQueueEntryId,
        found: output.queueEntryId || 'none',
        description: 'Generated prescription queue entry does not match active bound visit session',
      });
    }

    // 3. Draft Version Verification
    if (
      typeof source.draftVersion === 'number' &&
      typeof output.draftVersion === 'number' &&
      source.draftVersion !== output.draftVersion
    ) {
      mismatches.push({
        field: 'draftVersion',
        expected: String(source.draftVersion),
        found: String(output.draftVersion),
        description: 'Stale draft version detected between form state and submitted payload',
      });
    }

    // 4. Required Fields Check
    if (!output.draft.diagnosis || output.draft.diagnosis.trim() === '') {
      mismatches.push({
        field: 'diagnosis',
        expected: 'non-empty diagnosis',
        found: 'empty',
        description: 'Required diagnosis field is missing in generated output',
      });
    }

    if (!output.draft.medicines || output.draft.medicines.length === 0) {
      mismatches.push({
        field: 'medicines',
        expected: 'at least 1 medicine entry',
        found: '0 medicines',
        description: 'Required medicine list is empty in generated output',
      });
    }

    // 5. Diagnosis & Doctor Notes Comparison
    if (
      source.draft.diagnosis &&
      output.draft.diagnosis &&
      source.draft.diagnosis.trim().toLowerCase() !== output.draft.diagnosis.trim().toLowerCase()
    ) {
      mismatches.push({
        field: 'diagnosis',
        expected: source.draft.diagnosis,
        found: output.draft.diagnosis,
        description: 'Diagnosis text mismatch between doctor entry and output',
      });
    }

    if (
      source.draft.doctorNotes &&
      output.draft.doctorNotes &&
      source.draft.doctorNotes.trim() !== output.draft.doctorNotes.trim()
    ) {
      mismatches.push({
        field: 'doctorNotes',
        expected: source.draft.doctorNotes,
        found: output.draft.doctorNotes,
        description: 'Doctor notes mismatch between doctor entry and output',
      });
    }

    // 6. Medicines Comparison
    const sourceMedMap = new Map<string, (typeof source.draft.medicines)[0]>();
    for (const med of source.draft.medicines || []) {
      sourceMedMap.set(med.name.trim().toLowerCase(), med);
    }

    const outputMedMap = new Map<string, (typeof output.draft.medicines)[0]>();
    for (const med of output.draft.medicines || []) {
      outputMedMap.set(med.name.trim().toLowerCase(), med);
    }

    // Check missing doctor-entered medicines
    for (const [name, srcMed] of sourceMedMap.entries()) {
      const outMed = outputMedMap.get(name);
      if (!outMed) {
        mismatches.push({
          field: `medicine:${srcMed.name}`,
          expected: srcMed.name,
          found: 'missing',
          description: `Missing doctor-entered medicine '${srcMed.name}' in output`,
        });
      } else {
        // Detailed property comparison
        if (srcMed.dosage && outMed.dosage && srcMed.dosage.trim().toLowerCase() !== outMed.dosage.trim().toLowerCase()) {
          mismatches.push({
            field: `medicine:${srcMed.name}.dosage`,
            expected: srcMed.dosage,
            found: outMed.dosage,
            description: `Dosage mismatch for medicine '${srcMed.name}'`,
          });
        }
        if (srcMed.frequency && outMed.frequency && srcMed.frequency.trim().toLowerCase() !== outMed.frequency.trim().toLowerCase()) {
          mismatches.push({
            field: `medicine:${srcMed.name}.frequency`,
            expected: srcMed.frequency,
            found: outMed.frequency,
            description: `Frequency mismatch for medicine '${srcMed.name}'`,
          });
        }
        if (srcMed.duration && outMed.duration && srcMed.duration.trim().toLowerCase() !== outMed.duration.trim().toLowerCase()) {
          mismatches.push({
            field: `medicine:${srcMed.name}.duration`,
            expected: srcMed.duration,
            found: outMed.duration,
            description: `Duration mismatch for medicine '${srcMed.name}'`,
          });
        }
        if (srcMed.instructions && outMed.instructions && srcMed.instructions.trim().toLowerCase() !== outMed.instructions.trim().toLowerCase()) {
          mismatches.push({
            field: `medicine:${srcMed.name}.instructions`,
            expected: srcMed.instructions,
            found: outMed.instructions,
            description: `Instructions mismatch for medicine '${srcMed.name}'`,
          });
        }
      }
    }

    // Check unexpected extra medicines in output
    for (const [name, outMed] of outputMedMap.entries()) {
      if (!sourceMedMap.has(name)) {
        mismatches.push({
          field: `medicine:${outMed.name}`,
          expected: 'none (not in doctor entry)',
          found: outMed.name,
          description: `Unexpected extra medicine '${outMed.name}' found in output`,
        });
      }
    }

    // 7. Result Evaluation
    if (mismatches.length > 0) {
      return {
        verificationPassed: false,
        assistantText: `Pre-finalization verification failed. ${mismatches.length} mismatch(es) detected. Please review highlighted fields and edit manually.`,
        mismatches,
        editActionRequired: true,
        card: {
          type: 'verification_mismatch',
          patientId: source.patientId,
          mismatchesCount: mismatches.length,
          mismatchedFields: mismatches,
          requiresDoctorEdit: true,
        },
      };
    }

    return {
      verificationPassed: true,
      assistantText: 'The generated prescription matches the entered information. Please verify and approve.',
      mismatches: [],
      editActionRequired: false,
      card: {
        type: 'verification_passed',
        patientId: source.patientId,
        medicinesCount: output.draft.medicines.length,
        requiresDoctorFinalization: true,
      },
    };
  }
}
