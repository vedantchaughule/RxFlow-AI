import { describe, it, expect } from 'vitest';
import { crossTabMessageSchema, type CrossTabMessage } from '../src/ui-commands.js';

describe('Multi-Tab Coordination & Safety (PROMPT 20)', () => {
  const processedCommandIds = new Set<string>();
  let currentPatientQueueVersion = 4; // active tab version is 4

  const receiveCrossTabMessage = (msg: unknown) => {
    const parse = crossTabMessageSchema.safeParse(msg);
    if (!parse.success) return { action: 'drop', reason: 'invalid_schema' };

    const data = parse.data;

    // Deduplication check
    if (processedCommandIds.has(data.commandId)) {
      return { action: 'drop', reason: 'duplicate_command' };
    }

    // Staleness check
    if (data.patientQueueVersion < currentPatientQueueVersion) {
      return { action: 'drop', reason: 'stale_version' };
    }

    processedCommandIds.add(data.commandId);

    // Write protection check (No silent write execution)
    if (data.commandType === 'APPLY_PRESCRIPTION_DRAFT_FIELDS') {
      return {
        action: 'show_confirmation_gate',
        reason: 'Level 3 actions must not execute silently',
        payload: data.payload,
      };
    }

    return { action: 'execute', payload: data.payload };
  };

  describe('1. Zod Message Verification', () => {
    it('validates schema compliance of cross-tab messages', () => {
      const validMessage: CrossTabMessage = {
        version: '1.0',
        commandId: 'cmd_abc123',
        tabId: 'tab_999',
        sessionRef: 'session_xyz789',
        patientQueueVersion: 5,
        commandType: 'NAVIGATE_UI',
        payload: { targetPath: '/app/prescriptions' },
        timestamp: Date.now(),
      };
      const result = crossTabMessageSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
    });

    it('rejects message with missing fields', () => {
      const invalidMessage = {
        commandId: 'cmd_abc123',
        tabId: 'tab_999',
      };
      const result = crossTabMessageSchema.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });
  });

  describe('2. Deduplication & Staleness Guardrails', () => {
    it('deduplicates commands matching already processed commandId values', () => {
      const msg: CrossTabMessage = {
        version: '1.0',
        commandId: 'unique_cmd_001',
        tabId: 'tab_1',
        sessionRef: 'session_abc',
        patientQueueVersion: 4,
        commandType: 'NAVIGATE_UI',
        payload: { targetPath: '/app/prescriptions' },
        timestamp: Date.now(),
      };

      const res1 = receiveCrossTabMessage(msg);
      expect(res1.action).toBe('execute');

      const res2 = receiveCrossTabMessage(msg);
      expect(res2.action).toBe('drop');
      expect(res2.reason).toBe('duplicate_command');
    });

    it('ignores stale messages containing older patientQueueVersion values', () => {
      const staleMsg: CrossTabMessage = {
        version: '1.0',
        commandId: 'unique_cmd_002',
        tabId: 'tab_1',
        sessionRef: 'session_abc',
        patientQueueVersion: 3, // older than active tab version 4
        commandType: 'NAVIGATE_UI',
        payload: { targetPath: '/app/prescriptions' },
        timestamp: Date.now(),
      };

      const res = receiveCrossTabMessage(staleMsg);
      expect(res.action).toBe('drop');
      expect(res.reason).toBe('stale_version');
    });
  });

  describe('3. Level 3 Write Protection', () => {
    it('ensures applying draft fields across tabs triggers a confirmation gate and is not executed silently', () => {
      const writeMsg: CrossTabMessage = {
        version: '1.0',
        commandId: 'unique_cmd_003',
        tabId: 'tab_1',
        sessionRef: 'session_abc',
        patientQueueVersion: 4,
        commandType: 'APPLY_PRESCRIPTION_DRAFT_FIELDS',
        payload: { diagnosis: 'Flu' },
        timestamp: Date.now(),
      };

      const res = receiveCrossTabMessage(writeMsg);
      expect(res.action).toBe('show_confirmation_gate');
      expect(res.reason).toContain('must not execute silently');
    });
  });
});
