import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundMessage, normalizeWhatsappPhone } from '../../src/conversation/conversation.service.js';
import { conversationStore } from '../../src/conversation/conversation.store.js';
import { rxflowClient } from '../../src/rxflow/rxflow.client.js';

describe('Existing Patient Resolution (PROMPT 06)', () => {
  beforeEach(async () => {
    conversationStore.clear();
    vi.restoreAllMocks();
  });

  // ─── Phone Normalization ──────────────────────────────────────────

  describe('Phone Normalization', () => {
    it('normalizes whatsapp: prefix to standard E.164 (+91)', () => {
      expect(normalizeWhatsappPhone('whatsapp:+919876543210')).toBe('+919876543210');
    });

    it('leaves standard E.164 unchanged', () => {
      expect(normalizeWhatsappPhone('+919876543210')).toBe('+919876543210');
    });

    it('prepends +91 to 10-digit number', () => {
      expect(normalizeWhatsappPhone('9876543210')).toBe('+919876543210');
    });
  });

  // ─── EXACT_MATCH Flow ─────────────────────────────────────────────

  describe('EXACT_MATCH Flow', () => {
    it('resolves existing patient and moves directly to SELECT_DOCTOR', async () => {
      vi.spyOn(rxflowClient, 'resolvePatientByPhone').mockResolvedValue({
        status: 'EXACT_MATCH',
        patient: {
          patientId: 'patient_123',
          name: 'Priya Sharma',
          assignedDoctorId: 'doc_456',
        },
      });

      vi.spyOn(rxflowClient, 'getDoctors').mockResolvedValue([
        { doctorId: 'doc_456', name: 'Sharma', specialty: 'Cardiology', isAvailable: true },
      ]);

      const reply = await processInboundMessage('whatsapp:+919876543210', '1');

      expect(reply).toContain('Welcome back, *Priya Sharma*');
      expect(reply).toContain('Dr. Sharma');

      const session = await conversationStore.getSession('default:+919876543210');
      expect(session?.state).toBe('SELECT_DOCTOR');
      expect(session?.data.patientId).toBe('patient_123');
      expect(session?.data.patientName).toBe('Priya Sharma');
      expect(session?.data.isNewPatient).toBe(false);
    });
  });

  // ─── NOT_FOUND Flow ───────────────────────────────────────────────

  describe('NOT_FOUND Flow', () => {
    it('moves unknown phone to new patient registration (ASK_NAME)', async () => {
      vi.spyOn(rxflowClient, 'resolvePatientByPhone').mockResolvedValue({
        status: 'NOT_FOUND',
      });

      const reply = await processInboundMessage('whatsapp:+919800000000', '1');

      expect(reply).toContain("couldn't find an existing patient record");
      expect(reply).toContain('full *name*');

      const session = await conversationStore.getSession('default:+919800000000');
      expect(session?.state).toBe('ASK_NAME');
      expect(session?.data.isNewPatient).toBe(true);
      expect(session?.data.patientId).toBeUndefined();
    });
  });
});
