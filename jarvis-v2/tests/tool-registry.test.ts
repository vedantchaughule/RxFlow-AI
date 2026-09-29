import { describe, it, expect, beforeEach } from 'vitest';
import { DoctorControlPolicy, evaluatePolicy } from '../src/tools/doctor-control-policy.js';
import { getToolRegistry } from '../src/tools/tool-registry.js';
import type { ToolExecutionContext, ToolDefinition } from '../src/tools/tool-interface.js';

describe('Typed Tool Registry & Doctor Control Policy (PROMPT 05)', () => {
  const registry = getToolRegistry();
  const mockContext: ToolExecutionContext = {
    sessionId: 'sess_test_123',
    clinicId: 'clinic_test_123',
    doctorId: 'doc_test_123',
    boundPatientId: 'pat_test_123',
    boundQueueEntryId: 'queue_test_123',
    sessionToken: 'token_test_123',
  };

  beforeEach(() => {
    DoctorControlPolicy.getInstance().getLoopDetector().clearSession('sess_test_123');
    DoctorControlPolicy.getInstance().getLoopDetector().clearSession('sess_unbound_123');
  });

  describe('Tool Registry Catalog & Declarations', () => {
    it('contains all 20 required initial catalog tools', () => {
      const tools = registry.listTools();
      expect(tools.length).toBeGreaterThanOrEqual(20);

      const requiredToolNames = [
        'lookup_patient',
        'bind_patient',
        'get_patient_context',
        'get_queue_status',
        'search_inventory',
        'get_low_stock',
        'get_recent_prescriptions',
        'get_prescription_access_status',
        'get_appointment_status',
        'get_communication_status',
        'get_templates',
        'get_operational_summary',
        'navigate_ui',
        'propose_prescription_draft',
        'propose_appointment_change',
        'propose_inventory_change',
        'propose_patient_access',
        'propose_communication',
        'revoke_patient_access',
        'generate_replacement_access',
      ];

      for (const name of requiredToolNames) {
        expect(registry.hasTool(name)).toBe(true);
        const tool = registry.getTool(name)!;
        expect(tool.name).toBe(name);
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.outputSchema).toBeDefined();
        expect(tool.riskLevel).toBeGreaterThanOrEqual(0);
        expect(tool.riskLevel).toBeLessThanOrEqual(4);
        expect(typeof tool.requiresBoundPatient).toBe('boolean');
        expect(typeof tool.requiresActiveVisit).toBe('boolean');
        expect(typeof tool.requiresConfirmation).toBe('boolean');
        expect(typeof tool.timeoutMs).toBe('number');
        expect(typeof tool.idempotent).toBe('boolean');
      }
    });

    it('returns undefined for unregistered tools', () => {
      expect(registry.getTool('non_existent_tool')).toBeUndefined();
    });
  });

  describe('Doctor Control Policy Enforcement', () => {
    it('fails closed on unknown tools (TOOL_NOT_FOUND)', () => {
      const res = evaluatePolicy('unknown_fake_tool', {}, mockContext);
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.code).toBe('TOOL_NOT_FOUND');
        expect(res.statusCode).toBe(404);
      }
    });

    it('fails on input schema validation error', () => {
      // search_inventory requires { query: string }
      const res = evaluatePolicy('search_inventory', { query: 12345 }, mockContext);
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.code).toBe('VALIDATION_ERROR');
        expect(res.statusCode).toBe(400);
      }
    });

    it('strictly prohibits Level 4 tools', () => {
      // Register a synthetic Level 4 tool to verify hard block
      const level4Tool: ToolDefinition = {
        name: 'finalize_prescription_autonomously',
        description: 'Synthetic level 4 tool',
        inputSchema: getToolRegistry().getTool('get_operational_summary')!.inputSchema,
        outputSchema: getToolRegistry().getTool('get_operational_summary')!.outputSchema,
        riskLevel: 4,
        requiresBoundPatient: true,
        requiresActiveVisit: true,
        requiresConfirmation: true,
        timeoutMs: 5000,
        idempotent: false,
      };
      registry.registerTool(level4Tool);

      const res = evaluatePolicy('finalize_prescription_autonomously', {}, mockContext);
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.code).toBe('LEVEL_4_PROHIBITED');
        expect(res.statusCode).toBe(403);
      }
    });

    it('rejects patient-bound tools when patient is not bound', () => {
      const unboundContext: ToolExecutionContext = {
        ...mockContext,
        sessionId: 'sess_unbound_123',
        boundPatientId: null,
      };

      const res = evaluatePolicy('get_patient_context', { patientId: 'pat_123' }, unboundContext);
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.code).toBe('PATIENT_NOT_BOUND');
        expect(res.statusCode).toBe(400);
      }
    });

    it('rejects active-visit tools when active visit queue entry is missing', () => {
      const noVisitContext: ToolExecutionContext = {
        ...mockContext,
        sessionId: 'sess_unbound_123',
        boundPatientId: 'pat_123',
        boundQueueEntryId: null,
      };

      const draftPayload = {
        draft: {
          diagnosis: 'Acute Rhinitis',
          doctorNotes: 'Rest and hydration',
          medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'Twice daily', duration: '5 days', instructions: 'After food' }],
          missingFields: [],
          warnings: [],
        },
      };

      const res = evaluatePolicy('propose_prescription_draft', draftPayload, noVisitContext);
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.code).toBe('ACTIVE_VISIT_NOT_BOUND');
        expect(res.statusCode).toBe(400);
      }
    });

    it('stops repeated identical tool execution loops', () => {
      const args = { query: 'Amoxicillin' };

      // Call 1 & Call 2 succeed
      expect(evaluatePolicy('search_inventory', args, mockContext).allowed).toBe(true);
      expect(evaluatePolicy('search_inventory', args, mockContext).allowed).toBe(true);

      // Call 3 (identical) fails loop detection
      const res = evaluatePolicy('search_inventory', args, mockContext);
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.code).toBe('REPEATED_TOOL_LOOP');
        expect(res.statusCode).toBe(429);
      }
    });

    it('returns correct actionType for Level 0 UI tools', () => {
      const res = evaluatePolicy('navigate_ui', { targetRoute: '/patients' }, mockContext);
      expect(res.allowed).toBe(true);
      if (res.allowed) {
        expect(res.actionType).toBe('execute_ui');
      }
    });

    it('returns correct actionType for Level 1 Read tools', () => {
      const res = evaluatePolicy('search_inventory', { query: 'Paracetamol' }, mockContext);
      expect(res.allowed).toBe(true);
      if (res.allowed) {
        expect(res.actionType).toBe('execute_read');
      }
    });

    it('returns correct actionType for Level 2 Draft tools', () => {
      const draftPayload = {
        draft: {
          diagnosis: 'Flu',
          doctorNotes: 'Hydrate',
          medicines: [{ name: 'Paracetamol', dosage: '500mg', frequency: 'Twice daily', duration: '3 days', instructions: 'After food' }],
          missingFields: [],
          warnings: [],
        },
      };

      const res = evaluatePolicy('propose_prescription_draft', draftPayload, mockContext);
      expect(res.allowed).toBe(true);
      if (res.allowed) {
        expect(res.actionType).toBe('apply_draft');
      }
    });

    it('returns correct actionType for Level 3 Protected Proposal tools', () => {
      const payload = {
        prescriptionId: 'rx_123',
        expiryHours: 48,
      };

      const res = evaluatePolicy('propose_patient_access', payload, mockContext);
      expect(res.allowed).toBe(true);
      if (res.allowed) {
        expect(res.actionType).toBe('create_pending_proposal');
      }
    });
  });
});
