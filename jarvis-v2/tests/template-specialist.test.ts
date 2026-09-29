import { describe, it, expect, vi } from 'vitest';
import { TemplateSpecialist } from '../src/specialists/template-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { parseLocalIntent } from '../src/parser/local-parser.js';
import { applyPrescriptionDraftFieldsCommandSchema } from '../src/ui-commands.js';

describe('Templates & Reusable Doctor Drafting Specialist (PROMPT 16)', () => {
  const specialist = new TemplateSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_doc_tpl_101',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: '65f1a2b3c4d5e6f7a8b9c0d1',
    boundQueueEntryId: 'q_curr_101',
    sessionToken: 'token_doc_tpl',
  };

  // const _unboundContext: ToolExecutionContext = {
  //   sessionId: 'sess_unbound_102',
  //   clinicId: 'clinic_alpha',
  //   doctorId: 'doc_alpha',
  //   boundPatientId: null,
  //   boundQueueEntryId: null,
  //   sessionToken: 'token_unbound',
  // };

  // Mock Backend Templates Fixture
  const mockTemplates = [
    {
      _id: 'tpl_fever_101',
      clinicId: 'clinic_alpha',
      doctorId: 'doc_alpha',
      title: 'Fever & Cold Standard',
      diagnosis: 'Acute Upper Respiratory Tract Infection',
      doctorNotes: 'Rest and increase fluid intake.',
      medicines: [
        {
          name: 'Paracetamol',
          dosage: '500mg',
          frequency: 'Three times daily',
          duration: '3 days',
          instructions: 'after food',
        },
        {
          name: 'Cetirizine',
          dosage: '10mg',
          frequency: 'Once daily',
          duration: '5 days',
          instructions: 'at bedtime',
        },
      ],
    },
    {
      _id: 'tpl_hypertension_102',
      clinicId: 'clinic_alpha',
      doctorId: 'doc_alpha',
      title: 'Hypertension Protocol',
      diagnosis: 'Essential Hypertension',
      doctorNotes: 'Monitor blood pressure weekly.',
      medicines: [
        {
          name: 'Amlodipine',
          dosage: '5mg',
          frequency: 'Once daily',
          duration: '30 days',
          instructions: 'morning after food',
        },
      ],
    },
  ];

  const mockTemplateSupplier = async (titleOrId: string, ctx: ToolExecutionContext) => {
    if (ctx.clinicId !== 'clinic_alpha') return [];
    if (!titleOrId) return mockTemplates;

    const lower = titleOrId.toLowerCase();
    return mockTemplates.filter(
      (t) => t.title.toLowerCase().includes(lower) || t._id.toLowerCase() === lower
    );
  };

  const mockListSupplier = async (ctx: ToolExecutionContext) => {
    if (ctx.clinicId !== 'clinic_alpha') return [];
    return mockTemplates;
  };

  describe('1. Intent Parsing', () => {
    it('parses READ command: "Open my prescription template"', () => {
      const intent = parseLocalIntent('Open my prescription template');
      expect(intent.kind).toBe('list_templates');
    });

    it('parses APPLY command: "Use template Fever"', () => {
      const intent = parseLocalIntent('Use template Fever');
      expect(intent.kind).toBe('use_template');
      if (intent.kind === 'use_template') {
        expect(intent.templateName).toBe('Fever');
      }
    });

    it('parses FILL command: "Fill this blank template with the data I entered"', () => {
      const intent = parseLocalIntent('Fill this blank template with the data I entered');
      expect(intent.kind).toBe('fill_blank_template');
    });

    it('parses SAVE command: "Save this as a draft template"', () => {
      const intent = parseLocalIntent('Save this as a draft template');
      expect(intent.kind).toBe('save_draft_template');
    });
  });

  describe('2. READ Commands Execution', () => {
    it('1. "Open my prescription template": lists doctor saved templates (Level 1)', async () => {
      const result = await specialist.handleListTemplates(doctorContext, mockListSupplier);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.type).toBe('template_list');
      if (result.cards[0]?.type === 'template_list') {
        expect(result.cards[0].totalCount).toBe(2);
        expect(result.cards[0].templates.map((t) => t.title)).toContain('Fever & Cold Standard');
      }
      expect(result.assistantText).toContain('Found 2 saved prescription templates');
    });
  });

  describe('3. APPLY Commands Execution & Template Layout Preservation', () => {
    it('2. "Use template Fever": applies template fields to draft without hallucinating clinical content', async () => {
      const existingDraft = { diagnosis: '', doctorNotes: '', medicines: [] };
      const result = await specialist.handleUseTemplate('Fever', existingDraft, doctorContext, mockTemplateSupplier);

      expect(result.mergedDraft).toBeDefined();
      expect(result.mergedDraft?.diagnosis).toBe('Acute Upper Respiratory Tract Infection');
      expect(result.mergedDraft?.medicines).toHaveLength(2);
      expect(result.mergedDraft?.medicines[0]?.name).toBe('Paracetamol');
      expect(result.mergedDraft?.medicines[0]?.dosage).toBe('500mg');

      expect(result.uiCommand).toBeDefined();
      expect(result.uiCommand?.type).toBe('APPLY_PRESCRIPTION_DRAFT_FIELDS');
      const parsedCmd = applyPrescriptionDraftFieldsCommandSchema.safeParse(result.uiCommand);
      expect(parsedCmd.success).toBe(true);
      expect(result.assistantText).toContain("Applied template 'Fever & Cold Standard'");
    });

    it('returns 404 error when requested template is not found in library', async () => {
      const result = await specialist.handleUseTemplate('NonExistentTemplate', null, doctorContext, mockTemplateSupplier);

      expect(result.error).toBe('NOT_FOUND');
      expect(result.statusCode).toBe(404);
      expect(result.assistantText).toContain("no saved template matching 'NonExistentTemplate' was found");
    });
  });

  describe('4. FILL Commands & Empty Fields / No Invented Content Rules', () => {
    it('3. "Fill this blank template...": fills template strictly from doctor data, empty fields stay empty and are flagged', () => {
      const doctorInput = {
        diagnosis: 'Acute Gastritis',
        medicines: [
          {
            name: 'Pantoprazole',
            dosage: '40mg',
            frequency: '', // Empty unsupplied frequency
            duration: '',  // Empty unsupplied duration
            instructions: 'before food',
          },
        ],
      };

      const ctxWithDistinctSess = { ...doctorContext, sessionId: 'sess_fill_blank_1' };
      const result = specialist.handleFillBlankTemplate(doctorInput, null, ctxWithDistinctSess);

      expect(result.mergedDraft).toBeDefined();
      expect(result.mergedDraft?.diagnosis).toBe('Acute Gastritis');
      expect(result.mergedDraft?.doctorNotes).toBe(''); // Empty field stays empty

      const med = result.mergedDraft!.medicines[0]!;
      expect(med.name).toBe('Pantoprazole');
      expect(med.frequency).toBe(''); // STRICT: Empty field stays empty
      expect(med.duration).toBe('');  // STRICT: Empty field stays empty

      // STRICT: Empty fields are flagged in missingFields
      expect(result.mergedDraft?.missingFields).toContain('frequency:Pantoprazole');
      expect(result.mergedDraft?.missingFields).toContain('duration:Pantoprazole');
      expect(result.assistantText).toContain('Filled blank template strictly from doctor-provided data without inventing content');
      expect(result.assistantText).toContain('Missing fields flagged:');
    });
  });

  describe('5. SAVE Commands & Level 3 Confirmation Gate', () => {
    it('4. "Save this as a draft template": proposes Level 3 pending confirmation action', async () => {
      const draftData = {
        diagnosis: 'Acute Otitis Media',
        doctorNotes: 'Apply warm compress',
        medicines: [
          {
            name: 'Amoxicillin',
            dosage: '500mg',
            frequency: 'Three times daily',
            duration: '7 days',
            instructions: 'after food',
          },
        ],
      };

      const result = await specialist.proposeSaveTemplate('Otitis Protocol', draftData, doctorContext);

      expect(result.pendingAction).toBeDefined();
      expect(result.pendingAction?.type).toBe('confirm_template_save');
      expect(result.pendingAction?.title).toBe('Otitis Protocol');
      expect(result.pendingAction?.diagnosis).toBe('Acute Otitis Media');
      expect(result.assistantText).toContain("Please confirm to save template 'Otitis Protocol'");
    });

    it('rejects saving template if template title already exists (conflict error)', async () => {
      const draftData = { diagnosis: 'Fever', medicines: [] };
      const duplicateChecker = async (t: string) => t.toLowerCase().includes('fever');

      const result = await specialist.proposeSaveTemplate('Fever & Cold Standard', draftData, doctorContext, duplicateChecker);

      expect(result.error).toBe('CONFLICT');
      expect(result.statusCode).toBe(409);
      expect(result.pendingAction).toBeUndefined();
      expect(result.assistantText).toContain("template titled 'Fever & Cold Standard' already exists");
    });

    it('confirms template save and executes backend database creation', async () => {
      const draftData = { diagnosis: 'Migraine', medicines: [] };
      const proposal = await specialist.proposeSaveTemplate('Migraine Relief', draftData, doctorContext);

      const mockExecutor = vi.fn(async (action: any, ctx: ToolExecutionContext) => ({
        _id: 'tpl_new_888',
        clinicId: ctx.clinicId,
        doctorId: ctx.doctorId,
        title: action.title,
      }));

      const confirmResult = await specialist.confirmSaveTemplate(proposal.pendingAction!, doctorContext, mockExecutor);

      expect(confirmResult.success).toBe(true);
      expect(mockExecutor).toHaveBeenCalled();
      expect(confirmResult.assistantText).toContain("Template 'Migraine Relief' saved successfully");
    });
  });
});
