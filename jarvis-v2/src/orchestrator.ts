import { evaluatePolicy } from './tools/doctor-control-policy.js';
import type { ToolExecutionContext } from './tools/tool-interface.js';

export const SPECIALIST_ALLOWLIST: Record<string, string[]> = {
  PatientSpecialist: ['lookup_patient', 'propose_patient_binding', 'get_patient_context'],
  QueueSpecialist: ['get_queue_status', 'propose_queue_status_change'],
  PrescriptionSpecialist: ['get_recent_prescriptions', 'propose_prescription_draft', 'confirm_prescription_finalization'],
  VerificationSpecialist: ['request_clinical_verification', 'confirm_verification_pin'],
  PrescriptionAccessSpecialist: ['prepare_patient_access', 'get_access_status'],
  InventorySpecialist: ['search_inventory', 'get_low_stock', 'propose_inventory_change'],
  AppointmentSpecialist: ['today_appointments', 'appointment_status', 'next_appointment', 'propose_appointment_change'],
  CommunicationSpecialist: ['communication_status', 'reminder_status', 'draft_communication', 'propose_communication'],
  TemplateSpecialist: ['list_templates', 'use_template', 'fill_blank_template', 'propose_template_change'],
  NavigationSpecialist: [],
  AnalyticsSpecialist: ['get_operational_summary'],
};

export type OrchestratorState = {
  sessionId: string;
  boundPatientId: string | null;
  activeVisitId: string | null;
  toolStepCount: number;
  pendingConfirmations: string[];
};

export class Orchestrator {
  private state: OrchestratorState;
  private maxToolSteps = 5;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      boundPatientId: null,
      activeVisitId: null,
      toolStepCount: 0,
      pendingConfirmations: [],
    };
  }

  public getState(): OrchestratorState {
    return { ...this.state };
  }

  public updatePatientBinding(patientId: string | null, visitId: string | null) {
    this.state.boundPatientId = patientId;
    this.state.activeVisitId = visitId;
  }

  /**
   * Safe execution wrapper for specialists calling internal tools.
   * Enforces tool-step limits, specialist allowlists, and policy checks.
   */
  public executeTool(
    specialistName: string,
    toolName: string,
    args: unknown,
    context: ToolExecutionContext
  ) {
    // 1. Tool step count limit to prevent loop chaos
    if (this.state.toolStepCount >= this.maxToolSteps) {
      throw new Error(`Orchestrator Limit: Maximum tool step count of ${this.maxToolSteps} reached`);
    }

    // 2. Specialist allowlist verification
    const allowed = SPECIALIST_ALLOWLIST[specialistName];
    if (!allowed || !allowed.includes(toolName)) {
      throw new Error(`Allowlist Violation: Specialist '${specialistName}' is not permitted to call tool '${toolName}'`);
    }

    // 3. Reject simultaneous conflicting Level 3 actions
    if (toolName.startsWith('propose_') || toolName.startsWith('confirm_')) {
      if (this.state.pendingConfirmations.includes(toolName)) {
        throw new Error(`Conflict Blocked: Simultaneous active confirmation for '${toolName}' is already pending`);
      }
      this.state.pendingConfirmations.push(toolName);
    }

    // 4. Policy validation
    const policyResult = evaluatePolicy(toolName, args, context);
    if (!policyResult.allowed) {
      throw new Error(`Policy Violation: Tool '${toolName}' execution blocked: ${policyResult.message}`);
    }

    this.state.toolStepCount += 1;
    return {
      success: true,
      executedTool: toolName,
      args,
    };
  }

  public resetTurnSteps() {
    this.state.toolStepCount = 0;
    this.state.pendingConfirmations = [];
  }
}
