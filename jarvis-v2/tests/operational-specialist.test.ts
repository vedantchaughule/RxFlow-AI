import { describe, it, expect } from 'vitest';
import { OperationalSpecialist } from '../src/specialists/operational-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { parseLocalIntent } from '../src/parser/local-parser.js';

describe('Clinic Operational Metrics & Query Assistance Specialist (PROMPT 17)', () => {
  const specialist = new OperationalSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_doc_ops_101',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_doc_ops',
  };

  const adminContext: ToolExecutionContext = {
    sessionId: 'sess_admin_ops_102',
    clinicId: 'clinic_alpha',
    doctorId: null,
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_admin_ops',
  };

  const otherClinicContext: ToolExecutionContext = {
    sessionId: 'sess_other_ops_103',
    clinicId: 'clinic_beta',
    doctorId: 'doc_beta',
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_other_ops',
  };

  // Mock Backend Analytics / Operational Metrics
  const mockBackendOpsData = {
    datePeriod: '2026-08-07 to 2026-08-07',
    completedCount: 14,
    waitingCount: 3,
    totalVolume: 18,
    cancelledCount: 1,
    averageWaitMinutes: 12.5,
    completionRatePercent: 77.78,
  };

  const mockOpsSupplier = async (from?: string, to?: string, ctx?: ToolExecutionContext) => {
    if (ctx?.clinicId !== 'clinic_alpha') {
      return {
        datePeriod: `${from} to ${to}`,
        completedCount: 0,
        waitingCount: 0,
        totalVolume: 0,
        cancelledCount: 0,
        averageWaitMinutes: null,
        completionRatePercent: null,
      };
    }
    return mockBackendOpsData;
  };

  describe('1. Intent Parsing', () => {
    it('parses question 1: "How many patients did I see today?"', () => {
      const intent = parseLocalIntent('How many patients did I see today?');
      expect(intent.kind).toBe('patients_seen_today');
    });

    it('parses question 2: "How many are waiting?"', () => {
      const intent = parseLocalIntent('How many are waiting?');
      expect(intent.kind).toBe('patients_waiting');
    });

    it('parses question 3: "Show operational summary."', () => {
      const intent = parseLocalIntent('Show operational summary.');
      expect(intent.kind).toBe('operational_summary');
    });
  });

  describe('2. Factual Patients Seen Today Query', () => {
    it('STRICT RULE: Reports exact backend completed count (No model guessing)', async () => {
      const supplier = async (ctx: ToolExecutionContext) => ({
        completedCount: ctx.clinicId === 'clinic_alpha' ? 14 : 0,
      });

      const ctxSeen = { ...doctorContext, sessionId: 'sess_doc_seen_1' };
      const result = await specialist.handlePatientsSeenToday(ctxSeen, supplier);

      expect(result.assistantText).toContain('seen and completed 14 patient consultation');
      expect(result.assistantText).not.toContain('guessed');
    });

    it('enforces clinic isolation for patients seen queries', async () => {
      const supplier = async (ctx: ToolExecutionContext) => ({
        completedCount: ctx.clinicId === 'clinic_alpha' ? 14 : 0,
      });

      const ctxOtherSeen = { ...otherClinicContext, sessionId: 'sess_other_seen_1' };
      const result = await specialist.handlePatientsSeenToday(ctxOtherSeen, supplier);

      expect(result.assistantText).toContain('seen and completed 0 patient consultation');
    });
  });

  describe('3. Factual Patients Waiting Query', () => {
    it('STRICT RULE: Reports exact backend active waiting queue count', async () => {
      const supplier = async (ctx: ToolExecutionContext) => ({
        waitingCount: ctx.clinicId === 'clinic_alpha' ? 3 : 0,
      });

      const ctxWait = { ...doctorContext, sessionId: 'sess_doc_wait_1' };
      const result = await specialist.handlePatientsWaiting(ctxWait, supplier);

      expect(result.assistantText).toContain('currently 3 patients waiting in the queue');
    });
  });

  describe('4. Full Operational Summary Query & Role Scoping', () => {
    it('returns full operational summary card for doctor session', async () => {
      const ctxSummaryDoc = { ...doctorContext, sessionId: 'sess_doc_summary_1' };
      const result = await specialist.handleOperationalSummary(undefined, ctxSummaryDoc, mockOpsSupplier);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.type).toBe('operational_summary');
      if (result.cards[0]?.type === 'operational_summary') {
        expect(result.cards[0].clinicId).toBe('clinic_alpha');
        expect(result.cards[0].doctorId).toBe('doc_alpha');
        expect(result.cards[0].data.completedCount).toBe(14);
        expect(result.cards[0].data.waitingCount).toBe(3);
        expect(result.cards[0].data.averageWaitMinutes).toBe(12.5);
      }

      expect(result.assistantText).toContain('14 completed, 3 waiting, 18 total volume');
      expect(result.assistantText).toContain('Avg wait time: 13 min');
    });

    it('returns operational summary for admin session without doctor restriction', async () => {
      const ctxSummaryAdmin = { ...adminContext, sessionId: 'sess_admin_summary_1' };
      const result = await specialist.handleOperationalSummary(undefined, ctxSummaryAdmin, mockOpsSupplier);

      expect(result.cards).toHaveLength(1);
      if (result.cards[0]?.type === 'operational_summary') {
        expect(result.cards[0].clinicId).toBe('clinic_alpha');
        expect(result.cards[0].doctorId).toBeUndefined();
      }
    });

    it('enforces strict clinic isolation: other clinic gets empty metrics', async () => {
      const ctxSummaryOther = { ...otherClinicContext, sessionId: 'sess_other_summary_1' };
      const result = await specialist.handleOperationalSummary(undefined, ctxSummaryOther, mockOpsSupplier);

      expect(result.cards[0]?.data.completedCount).toBe(0);
      expect(result.cards[0]?.data.waitingCount).toBe(0);
    });
  });
});
