import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundMessage } from '../../src/conversation/conversation.service.js';
import { conversationStore } from '../../src/conversation/conversation.store.js';
import { rxflowClient } from '../../src/rxflow/rxflow.client.js';

describe('Patient Commands, Reschedule, Cancel & Handoff (PROMPT 19 - 22)', () => {
  const phone = '+919876543210';

  beforeEach(async () => {
    vi.restoreAllMocks();
    await conversationStore.deleteSession(`default:${phone}`);
  });

  it('handles HELP command and triggers reception handoff alert (PROMPT 22)', async () => {
    const spyHandoff = vi.spyOn(rxflowClient, 'sendHandoffAlert').mockResolvedValue({
      alertId: 'alert_123',
      summary: 'Patient requested human assistance',
    });

    const reply = await processInboundMessage(phone, 'HELP');

    expect(reply).toContain('Connecting you with our clinic reception staff');
    expect(spyHandoff).toHaveBeenCalled();

    const session = await conversationStore.getSession(`default:${phone}`);
    expect(session?.state).toBe('HANDOFF');
  });

  it('handles STOP command and cancels active session (PROMPT 19)', async () => {
    const reply = await processInboundMessage(phone, 'STOP');

    expect(reply).toContain('cancelled');
    const session = await conversationStore.getSession(`default:${phone}`);
    expect(session?.state).toBe('CANCELLED');
  });

  it('handles MY APPOINTMENT command for existing active appointment (PROMPT 19)', async () => {
    vi.spyOn(rxflowClient, 'resolvePatientByPhone').mockResolvedValue({
      status: 'EXACT_MATCH',
      patient: { patientId: 'pat_1', name: 'Rahul Patil', phone },
    });

    vi.spyOn(rxflowClient, 'getActivePatientAppointment').mockResolvedValue({
      appointmentId: 'appt_100',
      clinicId: 'default',
      patientName: 'Rahul Patil',
      doctorName: 'Dr. Mehta',
      scheduledAt: '2026-08-10T10:30:00.000Z',
      durationMinutes: 15,
      status: 'confirmed',
    });

    const reply = await processInboundMessage(phone, 'MY APPOINTMENT');

    expect(reply).toContain('Rahul Patil');
    expect(reply).toContain('Dr. Mehta');
    expect(reply).toContain('CONFIRMED');
  });

  it('handles RESCHEDULE command and processes date selection (PROMPT 20)', async () => {
    vi.spyOn(rxflowClient, 'resolvePatientByPhone').mockResolvedValue({
      status: 'EXACT_MATCH',
      patient: { patientId: 'pat_1', name: 'Rahul Patil', phone },
    });

    vi.spyOn(rxflowClient, 'getActivePatientAppointment').mockResolvedValue({
      appointmentId: 'appt_100',
      clinicId: 'default',
      patientName: 'Rahul Patil',
      doctorId: 'doc_1',
      doctorName: 'Dr. Mehta',
      scheduledAt: '2026-08-10T10:30:00.000Z',
      durationMinutes: 15,
      status: 'confirmed',
    });

    const reply = await processInboundMessage(phone, 'RESCHEDULE');

    expect(reply).toContain('Rescheduling appointment');
    const session = await conversationStore.getSession(`default:${phone}`);
    expect(session?.state).toBe('SELECT_DATE');
    expect(session?.data.rescheduleAppointmentId).toBe('appt_100');
  });

  it('handles CANCEL prompt and cancels appointment upon confirmation (PROMPT 21)', async () => {
    // 1. Initiate cancel with existing active appointment
    await conversationStore.setSession(`default:${phone}`, {
      sessionId: 'sess_cancel',
      whatsappPhone: phone,
      clinicId: 'default',
      state: 'BOOKED',
      data: { appointmentId: 'appt_999', patientName: 'Rahul' },
      updatedAt: Date.now(),
    });

    const promptReply = await processInboundMessage(phone, 'CANCEL');
    expect(promptReply).toContain('Cancel appointment?');

    const spyCancel = vi.spyOn(rxflowClient, 'cancelAppointment').mockResolvedValue({
      appointmentId: 'appt_999',
      status: 'cancelled',
    });

    // 2. Patient confirms cancellation
    const confirmReply = await processInboundMessage(phone, '1');
    expect(confirmReply).toContain('Your appointment has been cancelled');
    expect(spyCancel).toHaveBeenCalledWith('appt_999');

    const session = await conversationStore.getSession(`default:${phone}`);
    expect(session?.state).toBe('CANCELLED');
  });
});
