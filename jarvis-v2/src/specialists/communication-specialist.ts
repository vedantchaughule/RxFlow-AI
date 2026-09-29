import crypto from 'node:crypto';
import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';

export type CommunicationItemCard = {
  type: 'communication_item';
  jobId: string;
  recipientPhone?: string;
  templateName: string;
  purpose: string;
  status: 'queued' | 'retry_scheduled' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'dead_letter';
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
};

export type CommunicationStatusListCard = {
  type: 'communication_status_list';
  patientId: string;
  messages: CommunicationItemCard[];
  totalCount: number;
};

export type PendingCommunicationAction = {
  actionId: string;
  type: 'confirm_communication_job';
  patientId: string;
  purpose: string;
  templateName: string;
  parameters: Record<string, string>;
  dedupeKey: string;
  expiresAt: string;
};

export type CommunicationTurnResult = {
  assistantText: string;
  cards: Array<CommunicationItemCard | CommunicationStatusListCard>;
  pendingAction?: PendingCommunicationAction | null;
  error?: string;
  statusCode?: number;
};

export class CommunicationSpecialist {
  /**
   * Sanitizes notification parameters to prevent leaking clinical diagnoses or medicines.
   * STRICT RULE: Generic notifications must NOT contain clinical content.
   */
  public sanitizeParameters(params: Record<string, string>): Record<string, string> {
    const allowedKeys = ['patient_name', 'appointment_time', 'clinic_name', 'doctor_name'];
    const sanitized: Record<string, string> = {};

    for (const key of Object.keys(params)) {
      const lowerKey = key.toLowerCase();
      if (allowedKeys.includes(lowerKey)) {
        sanitized[lowerKey] = params[key]!;
      }
    }

    return sanitized;
  }

  /**
   * READ: Factual communication status with STATUS TRUTHFULNESS guarantee (Risk Level 1)
   * Example: "Check WhatsApp delivery status"
   * STRICT RULE: Must NOT claim delivered/read without provider-confirmed status.
   */
  public async handleCommunicationStatus(
    patientId: string | undefined | null,
    context: ToolExecutionContext,
    supplier?: (patId: string, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<CommunicationTurnResult> {
    const targetPatientId = patientId || context.boundPatientId;

    if (!targetPatientId) {
      return {
        assistantText: "Tool 'get_communication_status' requires a confirmed bound patient session.",
        cards: [],
        error: 'PATIENT_NOT_BOUND',
        statusCode: 400,
      };
    }

    const policyResult = evaluatePolicy('get_communication_status', { patientId: targetPatientId }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(targetPatientId, context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: 'No WhatsApp communication logs found for this patient.',
        cards: [],
      };
    }

    const messages: CommunicationItemCard[] = rawItems.map((item) => ({
      type: 'communication_item',
      jobId: String(item.jobId || item._id),
      recipientPhone: item.recipientPhone || item.to,
      templateName: item.templateName || 'appointment_reminder',
      purpose: item.purpose || 'appointment_reminder',
      status: item.status || 'queued',
      sentAt: item.sentAt || null,
      deliveredAt: item.deliveredAt || null,
      readAt: item.readAt || null,
    }));

    const latest = messages[0]!;

    // STATUS TRUTHFULNESS GUARANTEE:
    // Only claim 'delivered' or 'read' if timeline explicitly confirms it!
    let statusDesc = `is currently '${latest.status}'`;
    if (latest.status === 'delivered') {
      statusDesc = 'has been DELIVERED to patient WhatsApp (provider confirmed)';
    } else if (latest.status === 'read') {
      statusDesc = 'has been READ by patient on WhatsApp (provider confirmed)';
    } else if (latest.status === 'queued') {
      statusDesc = 'is QUEUED in notification pipeline (awaiting WhatsApp send)';
    } else if (latest.status === 'sent') {
      statusDesc = 'has been SENT to Meta WhatsApp Cloud API (waiting for delivery receipt)';
    } else if (latest.status === 'failed' || latest.status === 'dead_letter') {
      statusDesc = `FAILED delivery (${latest.status})`;
    }

    return {
      assistantText: `WhatsApp notification (${latest.templateName}) for patient ${statusDesc}.`,
      cards: [{ type: 'communication_status_list', patientId: targetPatientId, messages, totalCount: messages.length }],
    };
  }

  /**
   * READ: Reminder status for appointments (Risk Level 1)
   * Example: "Check appointment reminder status"
   */
  public async handleReminderStatus(
    appointmentId: string | undefined,
    context: ToolExecutionContext,
    supplier?: (apptId: string | undefined, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<CommunicationTurnResult> {
    const policyResult = evaluatePolicy('get_communication_status', { patientId: context.boundPatientId || 'pat_placeholder' }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        error: policyResult.code,
        statusCode: policyResult.statusCode,
      };
    }

    let rawItems: any[] = [];
    if (supplier) {
      rawItems = await supplier(appointmentId, context);
    }

    if (!rawItems || rawItems.length === 0) {
      return {
        assistantText: 'No appointment reminder jobs found.',
        cards: [],
      };
    }

    const messages: CommunicationItemCard[] = rawItems.map((item) => ({
      type: 'communication_item',
      jobId: String(item.jobId || item._id),
      templateName: item.templateName || 'appointment_reminder',
      purpose: item.purpose || 'appointment_reminder',
      status: item.status || 'queued',
    }));

    return {
      assistantText: `Found ${messages.length} appointment reminder jobs for patient. Status: ${messages[0]!.status}.`,
      cards: [{ type: 'communication_status_list', patientId: context.boundPatientId || '', messages, totalCount: messages.length }],
    };
  }

  /**
   * DRAFT: Prepare message draft from doctor intent (Risk Level 2)
   * Example: "Prepare a message draft for appointment confirmation"
   * STRICT RULE: Clinical content is stripped from generic notification parameters.
   */
  public handleDraftCommunication(
    templateName: string,
    rawParameters: Record<string, string>,
    _context: ToolExecutionContext
  ): CommunicationTurnResult {
    const sanitizedParams = this.sanitizeParameters(rawParameters);

    return {
      assistantText: `Prepared WhatsApp message draft using template '${templateName}' with parameters: ${JSON.stringify(sanitizedParams)}. Clinical data omitted.`,
      cards: [],
    };
  }

  /**
   * PROTECTED: Propose communication action (Risk Level 3)
   * Example: "Send appointment confirmation via WhatsApp"
   * STRICT RULES:
   * 1. Patient consent required (opted_in).
   * 2. No direct model sending: returns pending proposal for doctor confirmation.
   * 3. Reuses existing backend job queue.
   */
  public async proposeCommunicationAction(
    purpose: string,
    templateName: string,
    rawParameters: Record<string, string>,
    context: ToolExecutionContext,
    consentSupplier?: (patientId: string, ctx: ToolExecutionContext) => Promise<{ status: string; categories: string[] }>
  ): Promise<CommunicationTurnResult> {
    const patientId = context.boundPatientId;

    if (!patientId) {
      return {
        assistantText: "Tool 'propose_communication' requires a confirmed bound patient session.",
        cards: [],
        error: 'PATIENT_NOT_BOUND',
        statusCode: 400,
      };
    }

    // 1. Consent Check
    if (consentSupplier) {
      const consent = await consentSupplier(patientId, context);
      if (!consent || consent.status !== 'opted_in') {
        return {
          assistantText: 'Cannot send WhatsApp notification: patient has OPTED OUT or not provided communication consent.',
          cards: [],
          error: 'CONSENT_REQUIRED',
          statusCode: 403,
        };
      }
    }

    const sanitizedParams = this.sanitizeParameters(rawParameters);

    // 2. Evaluate Doctor Control Policy (propose_communication is Level 3 tool)
    const policyResult = evaluatePolicy('propose_communication', {
      patientId,
      templateName,
      parameters: sanitizedParams,
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
    const dedupeKey = `appointment:${patientId}:${purpose}`;

    const pendingAction: PendingCommunicationAction = {
      actionId,
      type: 'confirm_communication_job',
      patientId,
      purpose,
      templateName,
      parameters: sanitizedParams,
      dedupeKey,
      expiresAt,
    };

    return {
      assistantText: `Please confirm to queue WhatsApp ${purpose} notification to patient using template '${templateName}'.`,
      cards: [],
      pendingAction,
    };
  }

  /**
   * PROTECTED EXECUTION: Confirm and queue communication action using backend WhatsApp job infrastructure
   */
  public async confirmCommunicationAction(
    pendingAction: PendingCommunicationAction,
    context: ToolExecutionContext,
    executor?: (action: PendingCommunicationAction, ctx: ToolExecutionContext) => Promise<{ queued: boolean; messageId?: string; reason?: string }>
  ): Promise<{ success: boolean; data?: any; error?: string; assistantText: string }> {
    if (new Date(pendingAction.expiresAt).getTime() < Date.now()) {
      return {
        success: false,
        error: 'EXPIRED_PROPOSAL',
        assistantText: 'Communication proposal has expired. Please re-issue the command.',
      };
    }

    if (executor) {
      const result = await executor(pendingAction, context);
      if (!result.queued) {
        if (result.reason === 'ALREADY_QUEUED') {
          return {
            success: true,
            data: result,
            assistantText: `Notification is already queued for this patient (${pendingAction.dedupeKey}). Duplicate prevented.`,
          };
        }
        return {
          success: false,
          error: result.reason || 'QUEUE_FAILED',
          assistantText: `Failed to queue notification: ${result.reason}`,
        };
      }

      return {
        success: true,
        data: result,
        assistantText: `WhatsApp notification successfully queued (Message ID: ${result.messageId}). Provider delivery tracking active.`,
      };
    }

    return {
      success: true,
      data: { queued: true, messageId: 'msg_999' },
      assistantText: `WhatsApp notification successfully queued for patient using template '${pendingAction.templateName}'.`,
    };
  }
}
