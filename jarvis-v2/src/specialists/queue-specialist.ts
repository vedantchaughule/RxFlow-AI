import crypto from 'node:crypto';
import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';
import { createOpenPatientCommand, createShowQueueCommand } from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';

export type QueueSummaryCard = {
  type: 'queue_summary';
  totalWaiting: number;
  inConsultation: number;
};

export type NextPatientCard = {
  type: 'next_patient';
  queueEntryId: string;
  patientId: string;
  patientName: string;
  tokenNumber: number;
};

export type CurrentPatientCard = {
  type: 'current_patient';
  queueEntryId: string;
  patientId: string;
  patientName: string;
  tokenNumber: number;
};

export type QueueListCard = {
  type: 'queue_list';
  entries: Array<{
    queueEntryId: string;
    patientId: string;
    patientName: string;
    tokenNumber: number;
    status: string;
  }>;
};

export type QueueTurnResult = {
  assistantText: string;
  cards: Array<QueueSummaryCard | NextPatientCard | CurrentPatientCard | QueueListCard>;
  pendingAction?: {
    actionId: string;
    type: 'confirm_queue_status_change';
    queueEntryId: string;
    targetStatus: string;
    expiresAt: string;
  } | null;
  uiCommand?: UICommand | null;
};

export class QueueSpecialist {
  public async handleQueueQuery(
    mode: 'remaining' | 'next' | 'current' | 'list',
    context: ToolExecutionContext,
    mockQueueSupplier?: (ctx: ToolExecutionContext) => Promise<{
      totalWaiting: number;
      inConsultation: number;
      nextPatient?: { queueEntryId: string; patientId: string; patientName: string; tokenNumber: number } | null;
      currentPatient?: { queueEntryId: string; patientId: string; patientName: string; tokenNumber: number } | null;
      queueList?: Array<{ queueEntryId: string; patientId: string; patientName: string; tokenNumber: number; status: string }>;
    }>
  ): Promise<QueueTurnResult> {
    // 1. Evaluate policy (get_queue_status is Level 1)
    const policyResult = evaluatePolicy('get_queue_status', { mode }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        pendingAction: null,
      };
    }

    // 2. Fetch real backend data via supplier or backend client
    let data: {
      totalWaiting: number;
      inConsultation: number;
      nextPatient?: { queueEntryId: string; patientId: string; patientName: string; tokenNumber: number } | null;
      currentPatient?: { queueEntryId: string; patientId: string; patientName: string; tokenNumber: number } | null;
      queueList?: Array<{ queueEntryId: string; patientId: string; patientName: string; tokenNumber: number; status: string }>;
    } = {
      totalWaiting: 0,
      inConsultation: 0,
      nextPatient: null,
      currentPatient: null,
      queueList: [],
    };

    if (mockQueueSupplier) {
      data = await mockQueueSupplier(context);
    }

    // 3. Process query by mode
    switch (mode) {
      case 'remaining': {
        const text = data.inConsultation > 0
          ? `There are ${data.totalWaiting} patients waiting in your queue today, with ${data.inConsultation} patient currently in consultation.`
          : `There are ${data.totalWaiting} patients waiting in your queue today.`;

        return {
          assistantText: text,
          cards: [{ type: 'queue_summary', totalWaiting: data.totalWaiting, inConsultation: data.inConsultation }],
          pendingAction: null,
        };
      }

      case 'next': {
        if (!data.nextPatient) {
          return {
            assistantText: 'There are no waiting patients next in line.',
            cards: [{ type: 'queue_summary', totalWaiting: data.totalWaiting, inConsultation: data.inConsultation }],
            pendingAction: null,
          };
        }

        const next = data.nextPatient;
        return {
          assistantText: `Next patient in line is ${next.patientName} (Token #${next.tokenNumber}).`,
          cards: [{ type: 'next_patient', ...next }],
          pendingAction: null,
        };
      }

      case 'current': {
        if (!data.currentPatient) {
          const nextText = data.nextPatient
            ? `There is no patient currently in consultation. Next patient in line is ${data.nextPatient.patientName} (Token #${data.nextPatient.tokenNumber}).`
            : 'There is no patient currently in consultation or waiting in queue.';

          return {
            assistantText: nextText,
            cards: [{ type: 'queue_summary', totalWaiting: data.totalWaiting, inConsultation: data.inConsultation }],
            pendingAction: null,
          };
        }

        const curr = data.currentPatient;
        const friendlyId = `RXF-${curr.patientId.slice(-6).toUpperCase()}`;

        return {
          assistantText: `Opening current consultation patient ${curr.patientName} (Token #${curr.tokenNumber}).`,
          cards: [{ type: 'current_patient', ...curr }],
          pendingAction: null,
          uiCommand: createOpenPatientCommand(curr.patientId, friendlyId, curr.queueEntryId),
        };
      }

      case 'list':
      default: {
        return {
          assistantText: `Showing your active waiting queue for today (${data.totalWaiting} waiting).`,
          cards: [{ type: 'queue_list', entries: data.queueList || [] }],
          pendingAction: null,
          uiCommand: createShowQueueCommand('waiting'),
        };
      }
    }
  }

  public proposeStatusChange(
    queueEntryId: string,
    targetStatus: 'in_consultation' | 'completed' | 'cancelled' | 'no_show',
    context: ToolExecutionContext
  ): QueueTurnResult {
    // Evaluate policy (propose_queue_status_change is Level 3)
    const policyResult = evaluatePolicy('propose_queue_status_change', { queueEntryId, targetStatus }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        pendingAction: null,
      };
    }

    const actionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      assistantText: `Please confirm to transition queue entry status to '${targetStatus}'.`,
      cards: [],
      pendingAction: {
        actionId,
        type: 'confirm_queue_status_change',
        queueEntryId,
        targetStatus,
        expiresAt,
      },
    };
  }
}
