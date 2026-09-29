import { describe, it, expect } from 'vitest';
import { Orchestrator, SPECIALIST_ALLOWLIST } from '../src/orchestrator.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';

describe('Runtime Multi-Agent Specialization & Orchestration (PROMPT 21)', () => {
  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_orch_101',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: '65f1a2b3c4d5e6f7a8b9c0d1',
    boundQueueEntryId: 'q_curr_101',
    sessionToken: 'token_doc',
  };

  describe('1. Specialist Allowlist Validation', () => {
    it('allows a specialist to execute a tool in its allowlist', () => {
      const orchestrator = new Orchestrator('sess_orch_101');
      const result = orchestrator.executeTool('PatientSpecialist', 'lookup_patient', { query: 'test' }, doctorContext);
      expect(result.success).toBe(true);
      expect(result.executedTool).toBe('lookup_patient');
    });

    it('PROVES a specialist CANNOT call forbidden tools not in its allowlist', () => {
      const orchestrator = new Orchestrator('sess_orch_101');
      // PatientSpecialist tries to execute propose_inventory_change (forbidden for PatientSpecialist)
      expect(() => {
        orchestrator.executeTool('PatientSpecialist', 'propose_inventory_change', { query: 'paracetamol', mode: 'set', amount: 10 }, doctorContext);
      }).toThrowError(/Allowlist Violation: Specialist 'PatientSpecialist' is not permitted/);
    });

    it('verifies all expected specialists are mapped in allowlists', () => {
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('PatientSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('QueueSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('PrescriptionSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('VerificationSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('PrescriptionAccessSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('InventorySpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('AppointmentSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('CommunicationSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('TemplateSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('NavigationSpecialist');
      expect(SPECIALIST_ALLOWLIST).toHaveProperty('AnalyticsSpecialist');
    });
  });

  describe('2. Orchestrator Step Limits & Chaos Control', () => {
    it('blocks tool execution when maximum step count of 5 is exceeded', () => {
      const orchestrator = new Orchestrator('sess_orch_102');
      // Run 5 successful steps
      for (let i = 0; i < 5; i++) {
        orchestrator.executeTool('PatientSpecialist', 'lookup_patient', { query: `test-${i}` }, doctorContext);
      }
      expect(orchestrator.getState().toolStepCount).toBe(5);

      // 6th step should be blocked
      expect(() => {
        orchestrator.executeTool('PatientSpecialist', 'lookup_patient', { query: 'too-many' }, doctorContext);
      }).toThrowError(/Orchestrator Limit: Maximum tool step count of 5 reached/);
    });
  });

  describe('3. Rejection of Conflicting Simultaneous Confirmations', () => {
    it('rejects duplicate/conflicting simultaneous protected actions', () => {
      const orchestrator = new Orchestrator('sess_orch_103');
      // First proposal is accepted
      const res1 = orchestrator.executeTool('TemplateSpecialist', 'propose_template_change', { title: 'Fever template' }, doctorContext);
      expect(res1.success).toBe(true);

      // Attempting the same confirmation before reset triggers conflict block
      expect(() => {
        orchestrator.executeTool('TemplateSpecialist', 'propose_template_change', { title: 'Fever template' }, doctorContext);
      }).toThrowError(/Conflict Blocked: Simultaneous active confirmation/);
    });
  });
});
