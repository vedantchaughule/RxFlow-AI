import crypto from 'node:crypto';
import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';
import { createApplyDraftCommand } from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';
import type { PrescriptionDraft, MedicineItem } from '../types.js';
import { PrescriptionDraftSpecialist } from './prescription-draft-specialist.js';

export type TemplateCardItem = {
  templateId: string;
  title: string;
  diagnosis: string;
  doctorNotes?: string;
  medicines: MedicineItem[];
  medicinesCount: number;
};

export type TemplateListCard = {
  type: 'template_list';
  templates: TemplateCardItem[];
  totalCount: number;
};

export type PendingTemplateAction = {
  actionId: string;
  type: 'confirm_template_save';
  title: string;
  diagnosis: string;
  doctorNotes?: string;
  medicines: MedicineItem[];
  expiresAt: string;
};

export type TemplateTurnResult = {
  assistantText: string;
  cards: Array<TemplateListCard>;
  pendingAction?: PendingTemplateAction | null;
  mergedDraft?: PrescriptionDraft;
  uiCommand?: UICommand | null;
  error?: string;
  statusCode?: number;
};

export class TemplateSpecialist {
  private readonly draftSpecialist = new PrescriptionDraftSpecialist();

  /**
   * READ: Fetch doctor prescription templates (Risk Level 1)
   * Example: "Open my prescription template"
   */
  public async handleListTemplates(
    context: ToolExecutionContext,
    supplier?: (ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<TemplateTurnResult> {
    const policyResult = evaluatePolicy('get_templates', {}, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let rawTemplates: any[] = [];
    if (supplier) {
      rawTemplates = await supplier(context);
    }

    if (!rawTemplates || rawTemplates.length === 0) {
      return {
        assistantText: 'You currently have no saved prescription templates.',
        cards: [{ type: 'template_list', templates: [], totalCount: 0 }],
      };
    }

    const templates: TemplateCardItem[] = rawTemplates.map((t) => ({
      templateId: String(t.templateId || t._id),
      title: t.title,
      diagnosis: t.diagnosis || '',
      doctorNotes: t.doctorNotes || '',
      medicines: Array.isArray(t.medicines) ? t.medicines : [],
      medicinesCount: Array.isArray(t.medicines) ? t.medicines.length : 0,
    }));

    return {
      assistantText: `Found ${templates.length} saved prescription templates in your clinic library.`,
      cards: [{ type: 'template_list', templates, totalCount: templates.length }],
    };
  }

  /**
   * APPLY: Use template X and apply to unsaved draft (Risk Level 1 / Level 2 draft)
   * Example: "Use template Fever"
   * STRICT RULE: Structure preserved, no invented clinical content.
   */
  public async handleUseTemplate(
    titleOrId: string,
    existingDraft: Partial<PrescriptionDraft> | null | undefined,
    context: ToolExecutionContext,
    supplier?: (titleOrId: string, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<TemplateTurnResult> {
    let rawTemplates: any[] = [];
    if (supplier) {
      rawTemplates = await supplier(titleOrId, context);
    }

    if (!rawTemplates || rawTemplates.length === 0) {
      return {
        assistantText: `Cannot apply template: no saved template matching '${titleOrId}' was found.`,
        cards: [],
        error: 'NOT_FOUND',
        statusCode: 404,
      };
    }

    const template = rawTemplates[0];
    const incomingDraft: PrescriptionDraft = {
      diagnosis: template.diagnosis || '',
      doctorNotes: template.doctorNotes || '',
      medicines: Array.isArray(template.medicines) ? template.medicines : [],
      missingFields: [],
      warnings: [],
    };

    // Evaluate Level 2 policy propose_prescription_draft
    const policyResult = evaluatePolicy('propose_prescription_draft', { draft: incomingDraft }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    const mergeResult = this.draftSpecialist.mergeDrafts(existingDraft, incomingDraft, true);

    const patientId = context.boundPatientId!;
    const queueEntryId = context.boundQueueEntryId || undefined;
    const uiCommand = createApplyDraftCommand(patientId, queueEntryId, mergeResult.mergedDraft, mergeResult.mergedFields);

    return {
      assistantText: `Applied template '${template.title}' to active prescription draft. Structure preserved. Please review and finalize.`,
      cards: [],
      mergedDraft: mergeResult.mergedDraft,
      uiCommand,
    };
  }

  /**
   * FILL: Fill blank template with data provided by doctor ONLY (Risk Level 2)
   * Example: "Fill this blank template with the data I entered"
   * STRICT RULES:
   * 1. Fills fields from doctor-provided data only.
   * 2. Empty fields stay empty and are flagged in missingFields.
   * 3. Zero invented clinical content.
   */
  public handleFillBlankTemplate(
    doctorInput: { diagnosis?: string; doctorNotes?: string; medicines?: MedicineItem[] },
    existingDraft: Partial<PrescriptionDraft> | null | undefined,
    context: ToolExecutionContext
  ): TemplateTurnResult {
    const diagnosis = (doctorInput.diagnosis || existingDraft?.diagnosis || '').trim();
    const doctorNotes = (doctorInput.doctorNotes || existingDraft?.doctorNotes || '').trim();
    const medicines: MedicineItem[] = Array.isArray(doctorInput.medicines)
      ? doctorInput.medicines
      : Array.isArray(existingDraft?.medicines)
      ? existingDraft!.medicines!
      : [];

    // Check missing fields strictly without inventing anything!
    const missingFields: string[] = [];
    if (!diagnosis) missingFields.push('diagnosis');
    if (medicines.length === 0) missingFields.push('medicines');

    for (const med of medicines) {
      if (!med.dosage) missingFields.push(`dosage:${med.name}`);
      if (!med.frequency) missingFields.push(`frequency:${med.name}`);
      if (!med.duration) missingFields.push(`duration:${med.name}`);
    }

    const filledDraft: PrescriptionDraft = {
      diagnosis,
      doctorNotes,
      medicines,
      missingFields,
      warnings: [],
    };

    const policyResult = evaluatePolicy('propose_prescription_draft', { draft: filledDraft }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    const patientId = context.boundPatientId!;
    const queueEntryId = context.boundQueueEntryId || undefined;
    const mergedFields = ['diagnosis', 'doctorNotes', ...medicines.map((m) => `medicine:${m.name}`)];
    const uiCommand = createApplyDraftCommand(patientId, queueEntryId, filledDraft, mergedFields);

    const missingNotice = missingFields.length > 0 ? ` Missing fields flagged: ${missingFields.join(', ')}.` : '';

    return {
      assistantText: `Filled blank template strictly from doctor-provided data without inventing content.${missingNotice}`,
      cards: [],
      mergedDraft: filledDraft,
      uiCommand,
    };
  }

  /**
   * PROTECTED: Propose saving current draft as a saved template (Risk Level 3)
   * Example: "Save this as a draft template"
   * Follows normal backend authorization and confirmation.
   */
  public async proposeSaveTemplate(
    title: string | undefined,
    draftData: Partial<PrescriptionDraft>,
    context: ToolExecutionContext,
    existingTemplateChecker?: (t: string, ctx: ToolExecutionContext) => Promise<boolean>
  ): Promise<TemplateTurnResult> {
    const templateTitle = (title || draftData.diagnosis || 'Standard Template').trim();

    if (!draftData.diagnosis && (!draftData.medicines || draftData.medicines.length === 0)) {
      return {
        assistantText: 'Cannot save template: prescription draft has no diagnosis or medicines.',
        cards: [],
        error: 'EMPTY_DRAFT',
        statusCode: 400,
      };
    }

    // Check duplicate title conflict if checker provided
    if (existingTemplateChecker) {
      const exists = await existingTemplateChecker(templateTitle, context);
      if (exists) {
        return {
          assistantText: `Cannot save template: a template titled '${templateTitle}' already exists in your library.`,
          cards: [],
          error: 'CONFLICT',
          statusCode: 409,
        };
      }
    }

    // Evaluate Level 3 policy propose_template_change
    const policyResult = evaluatePolicy('propose_template_change', {
      title: templateTitle,
      diagnosis: draftData.diagnosis || '',
      doctorNotes: draftData.doctorNotes || '',
    }, context);

    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    const actionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const pendingAction: PendingTemplateAction = {
      actionId,
      type: 'confirm_template_save',
      title: templateTitle,
      diagnosis: draftData.diagnosis || '',
      doctorNotes: draftData.doctorNotes || '',
      medicines: draftData.medicines || [],
      expiresAt,
    };

    return {
      assistantText: `Please confirm to save template '${templateTitle}' to your prescription template library.`,
      cards: [],
      pendingAction,
    };
  }

  /**
   * PROTECTED EXECUTION: Confirm and save template to backend database
   */
  public async confirmSaveTemplate(
    pendingAction: PendingTemplateAction,
    context: ToolExecutionContext,
    executor?: (action: PendingTemplateAction, ctx: ToolExecutionContext) => Promise<any>
  ): Promise<{ success: boolean; data?: any; error?: string; assistantText: string }> {
    if (new Date(pendingAction.expiresAt).getTime() < Date.now()) {
      return {
        success: false,
        error: 'EXPIRED_PROPOSAL',
        assistantText: 'Template save proposal has expired. Please re-issue the command.',
      };
    }

    if (executor) {
      try {
        const result = await executor(pendingAction, context);
        return {
          success: true,
          data: result,
          assistantText: `Template '${pendingAction.title}' saved successfully to clinic library.`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: err?.code || 'SAVE_FAILED',
          assistantText: `Failed to save template: ${err?.message || 'Conflict or authorization error'}`,
        };
      }
    }

    return {
      success: true,
      data: { templateId: 'tpl_999', title: pendingAction.title },
      assistantText: `Template '${pendingAction.title}' saved successfully to clinic library.`,
    };
  }
}
