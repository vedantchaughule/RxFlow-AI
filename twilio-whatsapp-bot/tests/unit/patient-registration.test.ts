import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundMessage } from '../../src/conversation/conversation.service.js';
import { conversationStore } from '../../src/conversation/conversation.store.js';
import { rxflowClient } from '../../src/rxflow/rxflow.client.js';

describe('Booking-Safe New Patient Registration (PROMPT 07)', () => {
  beforeEach(async () => {
    conversationStore.clear();
    vi.restoreAllMocks();
  });

  it('registers new patient safely without creating queue visit and advances to doctor selection', async () => {
    // 1. Unrecognized patient phone -> moves to ASK_NAME
    vi.spyOn(rxflowClient, 'resolvePatientByPhone').mockResolvedValue({ status: 'NOT_FOUND' });
    await processInboundMessage('whatsapp:+919811122233', '1');

    // 2. User enters Name -> moves to ASK_AGE
    await processInboundMessage('whatsapp:+919811122233', 'Amit Verma');

    // 3. User enters Age -> moves to ASK_GENDER
    await processInboundMessage('whatsapp:+919811122233', '29');

    // Setup mocks for registerPatient & getDoctors
    const registerSpy = vi.spyOn(rxflowClient, 'registerPatient').mockResolvedValue({
      patientId: 'patient_new_999',
      name: 'Amit Verma',
      isExisting: false,
    });

    vi.spyOn(rxflowClient, 'getDoctors').mockResolvedValue([
      { doctorId: 'doc_1', name: 'Gupta', specialty: 'General', isAvailable: true },
    ]);

    // 4. User enters Gender ("1" = Male) -> triggers registration + moves to SELECT_DOCTOR
    const reply = await processInboundMessage('whatsapp:+919811122233', '1');

    expect(registerSpy).toHaveBeenCalledWith({
      name: 'Amit Verma',
      whatsappPhone: '+919811122233',
      age: 29,
      gender: 'male',
    });

    expect(reply).toContain('Profile created for *Amit Verma*');
    expect(reply).toContain('Dr. Gupta');

    const session = await conversationStore.getSession('default:+919811122233');
    expect(session?.state).toBe('SELECT_DOCTOR');
    expect(session?.data.patientId).toBe('patient_new_999');
    expect(session?.data.patientName).toBe('Amit Verma');
  });
});
