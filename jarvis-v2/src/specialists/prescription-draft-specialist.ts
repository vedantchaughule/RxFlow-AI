import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';
import { createApplyDraftCommand } from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';
import type { PrescriptionDraft, MedicineItem } from '../types.js';

export type DraftMergeResult = {
  mergedDraft: PrescriptionDraft;
  mergedFields: string[];
  preservedFields: string[];
};

export type PrescriptionDraftTurnResult = {
  assistantText: string;
  mergedDraft?: PrescriptionDraft;
  mergedFields?: string[];
  preservedFields?: string[];
  uiCommand?: UICommand | null;
  error?: string;
  statusCode?: number;
};

export class PrescriptionDraftSpecialist {
  public parseDictationToDraft(dictationText: string): PrescriptionDraft {
    const text = dictationText.trim();
    if (!text) {
      return {
        diagnosis: '',
        doctorNotes: '',
        medicines: [],
        missingFields: ['diagnosis', 'medicines'],
        warnings: [],
      };
    }

    let diagnosis = '';
    let doctorNotes = '';
    const medicines: MedicineItem[] = [];

    // 1. Extract diagnosis
    const diagMatch = text.match(/(?:diagnosis|dx|diagnosed with|complaint):\s*([^,.\n]+)/i);
    if (diagMatch && diagMatch[1]) {
      diagnosis = diagMatch[1].trim();
    }

    // 2. Extract doctor notes
    const notesMatch = text.match(/(?:notes|advice|remark):\s*([^.\n]+)/i);
    if (notesMatch && notesMatch[1]) {
      doctorNotes = notesMatch[1].trim();
    }

    // 3. Clean string by removing diagnosis and notes phrases to prevent false match overlaps
    let cleanText = text;
    if (diagMatch && diagMatch[0]) {
      cleanText = cleanText.replace(diagMatch[0], '');
    }
    if (notesMatch && notesMatch[0]) {
      cleanText = cleanText.replace(notesMatch[0], '');
    }

    // Extract medicine dictations: "Tab Amoxicillin 500mg twice daily for 5 days after food"
    const medRegex = /(?:tab|cap|syr|inj|tbs|tsp|ointment)?\s*([A-Za-z0-9-]+)\s+(\d+\s*(?:mg|g|ml|mcg|puffs|units)?)\s+([A-Za-z0-9\s]+?)(?=\s+for|\s+after|\s+before|\s+with|\s+at|$)\s*(?:for\s+(\d+\s*(?:days|weeks|months|day|week|month)))?\s*(after food|before food|with food|at bedtime)?/gi;

    let match: RegExpExecArray | null;
    while ((match = medRegex.exec(cleanText)) !== null) {
      const nameRaw = match[1]?.trim();
      const dosageRaw = match[2]?.trim();
      const frequencyRaw = match[3]?.trim();
      const durationRaw = match[4]?.trim() || '';
      const instructionsRaw = match[5]?.trim() || '';

      if (nameRaw && nameRaw.length >= 2 && !/^(diagnosis|notes|advice|complaint|patient)$/i.test(nameRaw)) {
        medicines.push({
          name: nameRaw,
          dosage: dosageRaw || '',
          frequency: frequencyRaw || '',
          duration: durationRaw || '',
          instructions: instructionsRaw || '',
        });
      }
    }

    // Fallback if no medicine was parsed
    if (medicines.length === 0) {
      const fallbackMed = cleanText.match(/(?:give|prescribe|add)?\s*([A-Za-z0-9-]+)\s+(\d+[\w\s]*)/i);
      if (fallbackMed && fallbackMed[1]) {
        medicines.push({
          name: fallbackMed[1].trim(),
          dosage: fallbackMed[2]?.trim() || '',
          frequency: 'once daily',
          duration: '3 days',
          instructions: 'after food',
        });
      }
    }

    const missingFields: string[] = [];
    if (!diagnosis) missingFields.push('diagnosis');
    if (medicines.length === 0) missingFields.push('medicines');

    return {
      diagnosis,
      doctorNotes,
      medicines,
      missingFields,
      warnings: [],
    };
  }

  public mergeDrafts(
    existingDraft: Partial<PrescriptionDraft> | null | undefined,
    incomingDraft: PrescriptionDraft,
    overwriteExplicit = false
  ): DraftMergeResult {
    const current: PrescriptionDraft = {
      diagnosis: existingDraft?.diagnosis || '',
      doctorNotes: existingDraft?.doctorNotes || '',
      medicines: Array.isArray(existingDraft?.medicines) ? [...existingDraft!.medicines!] : [],
      missingFields: [],
      warnings: [],
    };

    const mergedFields: string[] = [];
    const preservedFields: string[] = [];

    // 1. Merge Diagnosis
    if (current.diagnosis && current.diagnosis.trim() !== '') {
      if (overwriteExplicit && incomingDraft.diagnosis) {
        current.diagnosis = incomingDraft.diagnosis;
        mergedFields.push('diagnosis');
      } else {
        preservedFields.push('diagnosis');
      }
    } else if (incomingDraft.diagnosis && incomingDraft.diagnosis.trim() !== '') {
      current.diagnosis = incomingDraft.diagnosis;
      mergedFields.push('diagnosis');
    }

    // 2. Merge Doctor Notes
    if (current.doctorNotes && current.doctorNotes.trim() !== '') {
      if (overwriteExplicit && incomingDraft.doctorNotes) {
        current.doctorNotes = incomingDraft.doctorNotes;
        mergedFields.push('doctorNotes');
      } else {
        preservedFields.push('doctorNotes');
      }
    } else if (incomingDraft.doctorNotes && incomingDraft.doctorNotes.trim() !== '') {
      current.doctorNotes = incomingDraft.doctorNotes;
      mergedFields.push('doctorNotes');
    }

    // 3. Merge Medicines (preserve non-empty fields, deduplicate / update matching entries)
    const existingMedMap = new Map<string, MedicineItem>();
    for (const med of current.medicines) {
      existingMedMap.set(med.name.trim().toLowerCase(), med);
    }

    for (const incMed of incomingDraft.medicines) {
      const key = incMed.name.trim().toLowerCase();
      const existingMed = existingMedMap.get(key);

      if (existingMed) {
        // Deduplicate & merge properties into existing medicine entry
        let updated = false;

        if (!existingMed.dosage && incMed.dosage) {
          existingMed.dosage = incMed.dosage;
          updated = true;
        }
        if (!existingMed.frequency && incMed.frequency) {
          existingMed.frequency = incMed.frequency;
          updated = true;
        }
        if (!existingMed.duration && incMed.duration) {
          existingMed.duration = incMed.duration;
          updated = true;
        }
        if (!existingMed.instructions && incMed.instructions) {
          existingMed.instructions = incMed.instructions;
          updated = true;
        }

        if (updated) {
          mergedFields.push(`medicine:${existingMed.name}`);
        } else {
          preservedFields.push(`medicine:${existingMed.name}`);
        }
      } else {
        // New medicine entry from dictation
        current.medicines.push({ ...incMed });
        mergedFields.push(`medicine:${incMed.name}`);
      }
    }

    // Compute missing fields after merge
    const missingFields: string[] = [];
    if (!current.diagnosis) missingFields.push('diagnosis');
    if (current.medicines.length === 0) missingFields.push('medicines');
    current.missingFields = missingFields;

    return {
      mergedDraft: current,
      mergedFields,
      preservedFields,
    };
  }

  public applyDraft(
    existingDraft: Partial<PrescriptionDraft> | null | undefined,
    incomingDraft: PrescriptionDraft,
    context: ToolExecutionContext,
    overwriteExplicit = false
  ): PrescriptionDraftTurnResult {
    // 1. Evaluate Doctor Control Policy (propose_prescription_draft is Level 2 tool)
    const policyResult = evaluatePolicy('propose_prescription_draft', { draft: incomingDraft }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    // 2. Perform non-destructive merge preserving manual fields
    const { mergedDraft, mergedFields, preservedFields } = this.mergeDrafts(existingDraft, incomingDraft, overwriteExplicit);

    // 3. Emit typed UI command APPLY_PRESCRIPTION_DRAFT_FIELDS
    const patientId = context.boundPatientId!;
    const queueEntryId = context.boundQueueEntryId || undefined;
    const uiCommand = createApplyDraftCommand(patientId, queueEntryId, mergedDraft, mergedFields);

    const assistantText = mergedFields.length > 0
      ? `Populated unsaved draft fields (${mergedFields.join(', ')}). Manual fields were preserved. Please review and finalize manually.`
      : 'Unsaved prescription draft matches proposed content. No changes applied.';

    return {
      assistantText,
      mergedDraft,
      mergedFields,
      preservedFields,
      uiCommand,
    };
  }
}
