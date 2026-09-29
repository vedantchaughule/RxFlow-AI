import crypto from 'node:crypto';
import type { ToolExecutionContext } from '../tools/tool-interface.js';
import { evaluatePolicy } from '../tools/doctor-control-policy.js';
import { createOpenPatientCommand } from '../ui-commands.js';
import type { UICommand } from '../ui-commands.js';

export type PatientIdentityCard = {
  type: 'patient_identity';
  patientId: string;
  friendlyId: string;
  name: string;
  age?: number;
  gender?: string;
  maskedPhone?: string;
  queueNumber?: number;
  queueEntryId?: string;
};

export type PatientChoiceCard = {
  type: 'patient_choices';
  query: string;
  candidates: Array<{
    patientId: string;
    friendlyId: string;
    name: string;
    age?: number;
    gender?: string;
    queueNumber?: number;
  }>;
};

export type PatientLookupTurnResult = {
  assistantText: string;
  cards: Array<PatientIdentityCard | PatientChoiceCard>;
  pendingAction?: {
    actionId: string;
    type: 'confirm_patient_binding';
    patientId: string;
    queueEntryId?: string;
    expiresAt: string;
  } | null;
  uiCommand?: UICommand | null;
};

export class PatientSpecialist {
  public async handleLookup(
    query: string,
    lookupType: 'auto' | 'patient_id' | 'name' | 'queue_number',
    context: ToolExecutionContext,
    mockPatientsSupplier?: (q: string, type: string, ctx: ToolExecutionContext) => Promise<any[]>
  ): Promise<PatientLookupTurnResult> {
    // 1. Evaluate policy
    const policyResult = evaluatePolicy('lookup_patient', { query, lookupType }, context);
    if (!policyResult.allowed) {
      return {
        assistantText: policyResult.message,
        cards: [],
        pendingAction: null,
      };
    }

    // 2. Perform lookup via supplier or backend client
    let matches: any[] = [];
    if (mockPatientsSupplier) {
      matches = await mockPatientsSupplier(query, lookupType, context);
    }

    // 3. Handle NO MATCH
    if (!matches || matches.length === 0) {
      return {
        assistantText: `No patient matching '${query}' was found in your clinic records.`,
        cards: [],
        pendingAction: null,
      };
    }

    // 4. Handle DUPLICATE MATCHES (> 1)
    if (matches.length > 1) {
      const candidates = matches.map((m) => ({
        patientId: m.patientId || String(m._id),
        friendlyId: m.friendlyId || m.patientCode || `RXF-${String(m.patientId || m._id).slice(-6).toUpperCase()}`,
        name: m.name,
        age: m.age,
        gender: m.gender,
        queueNumber: m.queueNumber,
      }));

      return {
        assistantText: `Found ${matches.length} patients matching '${query}'. Please select which patient to open.`,
        cards: [
          {
            type: 'patient_choices',
            query,
            candidates,
          },
        ],
        pendingAction: null,
      };
    }

    // 5. Handle EXACT MATCH (1 patient)
    const match = matches[0];
    const patientId = match.patientId || String(match._id);
    const friendlyId = match.friendlyId || match.patientCode || `RXF-${String(patientId).slice(-6).toUpperCase()}`;
    const queueEntryId = match.queueEntryId ? String(match.queueEntryId) : undefined;

    const identityCard: PatientIdentityCard = {
      type: 'patient_identity',
      patientId,
      friendlyId,
      name: match.name,
      age: match.age,
      gender: match.gender,
      maskedPhone: match.maskedPhone || (match.phone ? `****${String(match.phone).slice(-4)}` : undefined),
      queueNumber: match.queueNumber,
      queueEntryId,
    };

    const actionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      assistantText: `Found patient ${match.name} (${friendlyId}). Please confirm to open patient workspace and bind session context.`,
      cards: [identityCard],
      pendingAction: {
        actionId,
        type: 'confirm_patient_binding',
        patientId,
        queueEntryId,
        expiresAt,
      },
    };
  }

  public async confirmBinding(
    patientId: string,
    queueEntryId: string | undefined,
    context: ToolExecutionContext,
    patientValidator?: (patId: string, qId?: string, ctx?: ToolExecutionContext) => Promise<{ valid: boolean; errorReason?: string; friendlyId?: string }>
  ): Promise<{ success: boolean; error?: string; uiCommand?: UICommand; boundPatientId?: string; boundQueueEntryId?: string }> {
    if (patientValidator) {
      const validation = await patientValidator(patientId, queueEntryId, context);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errorReason || 'Patient binding rejected',
        };
      }
      const friendlyId = validation.friendlyId || `RXF-${patientId.slice(-6).toUpperCase()}`;
      return {
        success: true,
        boundPatientId: patientId,
        boundQueueEntryId: queueEntryId,
        uiCommand: createOpenPatientCommand(patientId, friendlyId, queueEntryId),
      };
    }

    const friendlyId = `RXF-${patientId.slice(-6).toUpperCase()}`;
    return {
      success: true,
      boundPatientId: patientId,
      boundQueueEntryId: queueEntryId,
      uiCommand: createOpenPatientCommand(patientId, friendlyId, queueEntryId),
    };
  }
}
