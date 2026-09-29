import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundMessage } from '../../src/conversation/conversation.service.js';
import { conversationStore } from '../../src/conversation/conversation.store.js';
import { rxflowClient } from '../../src/rxflow/rxflow.client.js';

describe('Final Confirmation & Double Booking Protection (PROMPT 09)', () => {
  beforeEach(async () => {
    conversationStore.clear();
    vi.restoreAllMocks();
  });

  it('presents booking summary, handles "No" change, and creates appointment on "Yes"', async () => {
    // Setup session at CONFIRM_BOOKING state
    const phone = '+919876543210';
    await conversationStore.setSession(`default:${phone}`, {
      sessionId: 'sess_confirm_001',
      whatsappPhone: phone,
      clinicId: 'default',
      state: 'CONFIRM_BOOKING',
      data: {
        patientId: 'p_101',
        patientName: 'Kavita Roy',
        doctorId: 'doc_1',
        doctorName: 'Kapoor',
        selectedDate: '2026-08-20',
        selectedSlotTime: '11:00 AM',
        scheduledAt: '2026-08-20T11:00:00.000Z',
      },
      updatedAt: Date.now(),
    });

    // 1. User replies "2" / "Change time" -> returns to SHOW_SLOTS
    vi.spyOn(rxflowClient, 'getSlots').mockResolvedValue({
      date: '2026-08-20',
      availableCount: 2,
      slots: [{ time: '11:00 AM', iso: '2026-08-20T11:00:00.000Z' }],
    });

    const changeReply = await processInboundMessage(phone, '2');
    expect(changeReply).toContain('Available slots');

    const sessionAfterChange = await conversationStore.getSession(`default:${phone}`);
    expect(sessionAfterChange?.state).toBe('SELECT_SLOT');

    // Reset session back to CONFIRM_BOOKING
    await conversationStore.setSession(`default:${phone}`, {
      sessionId: 'sess_confirm_001',
      whatsappPhone: phone,
      clinicId: 'default',
      state: 'CONFIRM_BOOKING',
      data: {
        patientId: 'p_101',
        patientName: 'Kavita Roy',
        doctorId: 'doc_1',
        doctorName: 'Kapoor',
        selectedDate: '2026-08-20',
        selectedSlotTime: '11:00 AM',
        scheduledAt: '2026-08-20T11:00:00.000Z',
      },
      updatedAt: Date.now(),
    });

    const createSpy = vi.spyOn(rxflowClient, 'createAppointment').mockResolvedValue({
      appointmentId: 'appt_999',
      clinicId: 'default',
      patientId: 'p_101',
      patientName: 'Kavita Roy',
      doctorId: 'doc_1',
      doctorName: 'Kapoor',
      scheduledAt: '2026-08-20T11:00:00.000Z',
      durationMinutes: 15,
      status: 'pending',
    });

    // 2. User replies "Yes" -> creates appointment
    const confirmReply = await processInboundMessage(phone, 'yes');
    expect(createSpy).toHaveBeenCalledWith({
      patientId: 'p_101',
      doctorId: 'doc_1',
      scheduledAt: '2026-08-20T11:00:00.000Z',
      durationMinutes: 15,
    });

    expect(confirmReply).toContain('Appointment Confirmed');
    expect(confirmReply).toContain('Kapoor');

    const sessionAfterConfirm = await conversationStore.getSession(`default:${phone}`);
    expect(sessionAfterConfirm?.state).toBe('BOOKED');
    expect(sessionAfterConfirm?.data.appointmentId).toBe('appt_999');
  });

  it('handles race condition HTTP 409 double booking gracefully', async () => {
    const phone = '+919876543210';
    await conversationStore.setSession(`default:${phone}`, {
      sessionId: 'sess_race_001',
      whatsappPhone: phone,
      clinicId: 'default',
      state: 'CONFIRM_BOOKING',
      data: {
        patientId: 'p_101',
        patientName: 'Kavita Roy',
        doctorId: 'doc_1',
        doctorName: 'Kapoor',
        selectedDate: '2026-08-20',
        selectedSlotTime: '11:00 AM',
        scheduledAt: '2026-08-20T11:00:00.000Z',
      },
      updatedAt: Date.now(),
    });

    vi.spyOn(rxflowClient, 'createAppointment').mockRejectedValue(
      new Error('RxFlow API call failed: 409 SLOT_NO_LONGER_AVAILABLE Conflict')
    );

    const reply = await processInboundMessage(phone, 'yes');

    expect(reply).toBe('That time was just booked. Please choose another available time.');

    const sessionAfterConflict = await conversationStore.getSession(`default:${phone}`);
    expect(sessionAfterConflict?.state).toBe('SHOW_SLOTS');
  });
});
