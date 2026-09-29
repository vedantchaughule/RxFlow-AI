import { describe, it, expect, beforeEach } from 'vitest';
import { handleStateTransition } from '../../src/conversation/booking-machine.js';
import type { ConversationSession } from '../../src/conversation/conversation.types.js';

function makeSession(overrides: Partial<ConversationSession> = {}): ConversationSession {
  return {
    sessionId: 'sess_test',
    whatsappPhone: '+919876543210',
    clinicId: 'clinic_001',
    state: 'WELCOME',
    data: {},
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('Booking State Machine (PROMPT 04)', () => {

  // ─── WELCOME ──────────────────────────────────────────────────
  describe('WELCOME state', () => {
    it('shows welcome message for unknown input', () => {
      const session = makeSession();
      const { updatedSession, replyText } = handleStateTransition(session, 'hello');
      expect(updatedSession.state).toBe('WELCOME');
      expect(replyText).toContain('Book appointment');
    });

    it('transitions to IDENTIFY_PATIENT when user replies "1"', () => {
      const session = makeSession();
      const { updatedSession, replyText } = handleStateTransition(session, '1');
      expect(updatedSession.state).toBe('IDENTIFY_PATIENT');
      expect(replyText).toContain('booking');
    });

    it('transitions to IDENTIFY_PATIENT for "book"', () => {
      const session = makeSession();
      const { updatedSession } = handleStateTransition(session, 'Book appointment');
      expect(updatedSession.state).toBe('IDENTIFY_PATIENT');
    });

    it('transitions to HANDOFF for "3" (talk to staff)', () => {
      const session = makeSession();
      const { updatedSession, replyText } = handleStateTransition(session, '3');
      expect(updatedSession.state).toBe('HANDOFF');
      expect(replyText).toContain('staff');
    });

    it('shows appointment check info for "2"', () => {
      const session = makeSession();
      const { updatedSession, replyText } = handleStateTransition(session, '2');
      expect(updatedSession.state).toBe('WELCOME');
      expect(replyText).toContain('check');
    });
  });

  // ─── Global Commands ──────────────────────────────────────────
  describe('Global commands', () => {
    it('"cancel" moves to CANCELLED from any state', () => {
      const session = makeSession({ state: 'ASK_NAME', data: { patientName: 'Test' } });
      const { updatedSession, replyText } = handleStateTransition(session, 'cancel');
      expect(updatedSession.state).toBe('CANCELLED');
      expect(updatedSession.data).toEqual({});
      expect(replyText).toContain('cancelled');
    });

    it('"stop" moves to CANCELLED', () => {
      const session = makeSession({ state: 'SELECT_DOCTOR' });
      const { updatedSession } = handleStateTransition(session, 'stop');
      expect(updatedSession.state).toBe('CANCELLED');
    });

    it('"restart" moves back to WELCOME', () => {
      const session = makeSession({ state: 'CONFIRM_BOOKING', data: { patientName: 'Test' } });
      const { updatedSession, replyText } = handleStateTransition(session, 'restart');
      expect(updatedSession.state).toBe('WELCOME');
      expect(replyText).toContain('Welcome');
    });

    it('re-entering after CANCELLED restarts to WELCOME', () => {
      const session = makeSession({ state: 'CANCELLED' });
      const { updatedSession } = handleStateTransition(session, 'hi');
      expect(updatedSession.state).toBe('WELCOME');
    });
  });

  // ─── ASK_NAME ─────────────────────────────────────────────────
  describe('ASK_NAME state', () => {
    it('accepts a valid name and transitions to ASK_AGE', () => {
      const session = makeSession({ state: 'ASK_NAME' });
      const { updatedSession, replyText } = handleStateTransition(session, 'Rahul Sharma');
      expect(updatedSession.state).toBe('ASK_AGE');
      expect(updatedSession.data.patientName).toBe('Rahul Sharma');
      expect(updatedSession.data.isNewPatient).toBe(true);
      expect(replyText).toContain('age');
    });

    it('rejects a name that is too short', () => {
      const session = makeSession({ state: 'ASK_NAME' });
      const { updatedSession, replyText } = handleStateTransition(session, 'A');
      expect(updatedSession.state).toBe('ASK_NAME');
      expect(replyText).toContain('valid name');
    });
  });

  // ─── ASK_AGE ──────────────────────────────────────────────────
  describe('ASK_AGE state', () => {
    it('accepts valid age and transitions to ASK_GENDER', () => {
      const session = makeSession({ state: 'ASK_AGE', data: { patientName: 'Test' } });
      const { updatedSession, replyText } = handleStateTransition(session, '25');
      expect(updatedSession.state).toBe('ASK_GENDER');
      expect(updatedSession.data.patientAge).toBe(25);
      expect(replyText).toContain('gender');
    });

    it('rejects non-numeric age', () => {
      const session = makeSession({ state: 'ASK_AGE' });
      const { updatedSession, replyText } = handleStateTransition(session, 'twenty');
      expect(updatedSession.state).toBe('ASK_AGE');
      expect(replyText).toContain('valid age');
    });

    it('rejects age > 150', () => {
      const session = makeSession({ state: 'ASK_AGE' });
      const { updatedSession } = handleStateTransition(session, '200');
      expect(updatedSession.state).toBe('ASK_AGE');
    });
  });

  // ─── ASK_GENDER ───────────────────────────────────────────────
  describe('ASK_GENDER state', () => {
    const doctors = [{ doctorId: 'd1', name: 'Smith', specialty: 'General' }];

    it('accepts "1" for male', () => {
      const session = makeSession({ state: 'ASK_GENDER', data: { availableDoctors: doctors } });
      const { updatedSession } = handleStateTransition(session, '1');
      expect(updatedSession.state).toBe('SELECT_DOCTOR');
      expect(updatedSession.data.patientGender).toBe('male');
    });

    it('accepts "female"', () => {
      const session = makeSession({ state: 'ASK_GENDER', data: { availableDoctors: doctors } });
      const { updatedSession } = handleStateTransition(session, 'female');
      expect(updatedSession.state).toBe('SELECT_DOCTOR');
      expect(updatedSession.data.patientGender).toBe('female');
    });

    it('accepts "3" for other', () => {
      const session = makeSession({ state: 'ASK_GENDER', data: { availableDoctors: doctors } });
      const { updatedSession } = handleStateTransition(session, '3');
      expect(updatedSession.state).toBe('SELECT_DOCTOR');
      expect(updatedSession.data.patientGender).toBe('other');
    });

    it('rejects invalid gender input', () => {
      const session = makeSession({ state: 'ASK_GENDER' });
      const { updatedSession, replyText } = handleStateTransition(session, 'xyz');
      expect(updatedSession.state).toBe('ASK_GENDER');
      expect(replyText).toContain('Male');
    });
  });

  // ─── SELECT_DOCTOR ────────────────────────────────────────────
  describe('SELECT_DOCTOR state', () => {
    const doctors = [
      { doctorId: 'd1', name: 'Smith', specialty: 'General' },
      { doctorId: 'd2', name: 'Patel', specialty: 'Cardiology' },
    ];

    it('selects doctor by number and transitions to SELECT_DATE', () => {
      const session = makeSession({ state: 'SELECT_DOCTOR', data: { availableDoctors: doctors } });
      const { updatedSession, replyText } = handleStateTransition(session, '1');
      expect(updatedSession.state).toBe('SELECT_DATE');
      expect(updatedSession.data.doctorId).toBe('d1');
      expect(updatedSession.data.doctorName).toBe('Smith');
      expect(replyText).toContain('date');
    });

    it('rejects out-of-range doctor number', () => {
      const session = makeSession({ state: 'SELECT_DOCTOR', data: { availableDoctors: doctors } });
      const { updatedSession } = handleStateTransition(session, '5');
      expect(updatedSession.state).toBe('SELECT_DOCTOR');
    });

    it('transitions to ERROR when no doctors available', () => {
      const session = makeSession({ state: 'SELECT_DOCTOR', data: { availableDoctors: [] } });
      const { updatedSession } = handleStateTransition(session, '1');
      expect(updatedSession.state).toBe('ERROR');
    });
  });

  // ─── SELECT_DATE ──────────────────────────────────────────────
  describe('SELECT_DATE state', () => {
    it('accepts "today"', () => {
      const session = makeSession({ state: 'SELECT_DATE', data: { doctorName: 'Smith' } });
      const { updatedSession } = handleStateTransition(session, 'today');
      expect(updatedSession.state).toBe('SHOW_SLOTS');
      expect(updatedSession.data.selectedDate).toBeDefined();
    });

    it('accepts "tomorrow"', () => {
      const session = makeSession({ state: 'SELECT_DATE', data: { doctorName: 'Smith' } });
      const { updatedSession } = handleStateTransition(session, 'tomorrow');
      expect(updatedSession.state).toBe('SHOW_SLOTS');
    });

    it('accepts DD/MM/YYYY format for future date', () => {
      const session = makeSession({ state: 'SELECT_DATE', data: { doctorName: 'Smith' } });
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const dateStr = `${String(futureDate.getDate()).padStart(2, '0')}/${String(futureDate.getMonth() + 1).padStart(2, '0')}/${futureDate.getFullYear()}`;
      const { updatedSession } = handleStateTransition(session, dateStr);
      expect(updatedSession.state).toBe('SHOW_SLOTS');
    });

    it('rejects invalid date format', () => {
      const session = makeSession({ state: 'SELECT_DATE', data: { doctorName: 'Smith' } });
      const { updatedSession, replyText } = handleStateTransition(session, 'next week');
      expect(updatedSession.state).toBe('SELECT_DATE');
      expect(replyText).toContain('DD/MM/YYYY');
    });

    it('rejects past date', () => {
      const session = makeSession({ state: 'SELECT_DATE', data: { doctorName: 'Smith' } });
      const { updatedSession, replyText } = handleStateTransition(session, '01/01/2020');
      expect(updatedSession.state).toBe('SELECT_DATE');
      expect(replyText).toContain('past');
    });
  });

  // ─── SELECT_SLOT ──────────────────────────────────────────────
  describe('SELECT_SLOT state', () => {
    const slots = [
      { time: '10:00 AM', iso: '2026-08-10T10:00:00' },
      { time: '10:30 AM', iso: '2026-08-10T10:30:00' },
    ];

    it('selects slot by number and transitions to CONFIRM_BOOKING', () => {
      const session = makeSession({
        state: 'SELECT_SLOT',
        data: { patientName: 'Test', doctorName: 'Smith', selectedDate: '2026-08-10', availableSlots: slots },
      });
      const { updatedSession, replyText } = handleStateTransition(session, '1');
      expect(updatedSession.state).toBe('CONFIRM_BOOKING');
      expect(updatedSession.data.selectedSlotTime).toBe('10:00 AM');
      expect(replyText).toContain('Please confirm your appointment');
    });

    it('rejects out-of-range slot number', () => {
      const session = makeSession({ state: 'SELECT_SLOT', data: { availableSlots: slots } });
      const { updatedSession } = handleStateTransition(session, '5');
      expect(updatedSession.state).toBe('SELECT_SLOT');
    });

    it('goes back to SELECT_DATE when no slots available', () => {
      const session = makeSession({ state: 'SELECT_SLOT', data: { availableSlots: [] } });
      const { updatedSession } = handleStateTransition(session, '1');
      expect(updatedSession.state).toBe('SELECT_DATE');
    });
  });

  // ─── CONFIRM_BOOKING ──────────────────────────────────────────
  describe('CONFIRM_BOOKING state', () => {
    it('"yes" transitions to BOOKING', () => {
      const session = makeSession({ state: 'CONFIRM_BOOKING' });
      const { updatedSession } = handleStateTransition(session, 'yes');
      expect(updatedSession.state).toBe('BOOKING');
    });

    it('"confirm" transitions to BOOKING', () => {
      const session = makeSession({ state: 'CONFIRM_BOOKING' });
      const { updatedSession } = handleStateTransition(session, 'confirm');
      expect(updatedSession.state).toBe('BOOKING');
    });

    it('"no" / "change" goes back to SHOW_SLOTS', () => {
      const session = makeSession({ state: 'CONFIRM_BOOKING' });
      const { updatedSession } = handleStateTransition(session, 'no');
      expect(updatedSession.state).toBe('SHOW_SLOTS');
    });

    it('rejects ambiguous input', () => {
      const session = makeSession({ state: 'CONFIRM_BOOKING' });
      const { updatedSession, replyText } = handleStateTransition(session, 'maybe');
      expect(updatedSession.state).toBe('CONFIRM_BOOKING');
      expect(replyText).toContain('Confirm');
    });
  });

  // ─── BOOKED ───────────────────────────────────────────────────
  describe('BOOKED state', () => {
    it('shows confirmation and offers to book another', () => {
      const session = makeSession({ state: 'BOOKED' });
      const { updatedSession, replyText } = handleStateTransition(session, 'thanks');
      expect(updatedSession.state).toBe('BOOKED');
      expect(replyText).toContain('confirmed');
    });

    it('"1" allows booking another appointment', () => {
      const session = makeSession({
        state: 'BOOKED',
        data: { availableDoctors: [{ doctorId: 'd1', name: 'Smith' }] },
      });
      const { updatedSession } = handleStateTransition(session, '1');
      expect(updatedSession.state).toBe('SELECT_DOCTOR');
    });
  });

  // ─── HANDOFF ──────────────────────────────────────────────────
  describe('HANDOFF state', () => {
    it('stays in HANDOFF and suggests restart', () => {
      const session = makeSession({ state: 'HANDOFF' });
      const { updatedSession, replyText } = handleStateTransition(session, 'hello');
      expect(updatedSession.state).toBe('HANDOFF');
      expect(replyText).toContain('staff');
    });
  });

  // ─── ERROR ────────────────────────────────────────────────────
  describe('ERROR state', () => {
    it('transitions back to WELCOME on any input', () => {
      const session = makeSession({ state: 'ERROR' });
      const { updatedSession, replyText } = handleStateTransition(session, 'hi');
      expect(updatedSession.state).toBe('WELCOME');
      expect(replyText).toContain('Welcome');
    });
  });

  // ─── Session Data Immutability ────────────────────────────────
  describe('Session immutability', () => {
    it('does not mutate the original session object', () => {
      const original = makeSession({ state: 'ASK_NAME' });
      const originalState = original.state;
      handleStateTransition(original, 'John Doe');
      expect(original.state).toBe(originalState);
    });
  });
});
