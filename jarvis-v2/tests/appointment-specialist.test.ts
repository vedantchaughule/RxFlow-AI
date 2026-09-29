import { describe, it, expect, vi } from 'vitest';
import { AppointmentSpecialist } from '../src/specialists/appointment-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { parseLocalIntent } from '../src/parser/local-parser.js';
import { openAppointmentFormCommandSchema } from '../src/ui-commands.js';

describe('Appointment Control Specialist (PROMPT 14)', () => {
  const specialist = new AppointmentSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_doc_appt_101',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: '65f1a2b3c4d5e6f7a8b9c0d1',
    boundQueueEntryId: 'q_curr_101',
    sessionToken: 'token_doc_appt',
  };

  const unboundContext: ToolExecutionContext = {
    sessionId: 'sess_unbound_102',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_unbound',
  };

  // Mock Appointments Fixtures
  const mockTodayAppointments = [
    {
      _id: 'app_101',
      clinicId: 'clinic_alpha',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d1',
      patientName: 'Priya Sharma',
      doctorId: 'doc_alpha',
      scheduledAt: '2026-08-07T10:00:00.000+05:30',
      durationMinutes: 15,
      status: 'confirmed',
    },
    {
      _id: 'app_102',
      clinicId: 'clinic_alpha',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d2',
      patientName: 'Rahul Patil',
      doctorId: 'doc_alpha',
      scheduledAt: '2026-08-07T11:30:00.000+05:30',
      durationMinutes: 15,
      status: 'pending',
    },
  ];

  const mockSlots = {
    available: ['09:00', '09:15', '09:30', '10:15', '10:30', '11:00'],
    booked: ['10:00', '11:30'],
  };

  const mockApptSupplier = async (_date: string, _ctx?: ToolExecutionContext) => mockTodayAppointments;
  const mockPatientApptSupplier = async (patId: string, _ctx: ToolExecutionContext) =>
    mockTodayAppointments.filter((a) => a.patientId === patId);
  const mockNextApptSupplier = async (_ctx: ToolExecutionContext) => [mockTodayAppointments[1]];
  const mockSlotsSupplier = async (_date: string, _ctx: ToolExecutionContext) => mockSlots;

  describe('1. Doctor Command Intent Parsing', () => {
    it("parses READ command: today's appointments", () => {
      const intent = parseLocalIntent("Show today's appointments");
      expect(intent.kind).toBe('today_appointments');
    });

    it('parses READ command: patient appointment status', () => {
      const intent = parseLocalIntent('Check patient appointment status');
      expect(intent.kind).toBe('appointment_status');
    });

    it('parses READ command: next appointment', () => {
      const intent = parseLocalIntent('What is the next appointment?');
      expect(intent.kind).toBe('next_appointment');
    });

    it('parses DRAFT command: prepare appointment form', () => {
      const intent = parseLocalIntent('Prepare appointment form for tomorrow at 10:30 AM for follow-up');
      expect(intent.kind).toBe('draft_appointment');
      if (intent.kind === 'draft_appointment') {
        expect(intent.date).toBe('tomorrow');
        expect(intent.time).toContain('10:30');
      }
    });

    it('parses PROTECTED command: create appointment', () => {
      const intent = parseLocalIntent('Create appointment for patient');
      expect(intent.kind).toBe('mutate_appointment');
      if (intent.kind === 'mutate_appointment') {
        expect(intent.action).toBe('create');
      }
    });

    it('parses PROTECTED command: reschedule appointment', () => {
      const intent = parseLocalIntent('Reschedule appointment to Friday');
      expect(intent.kind).toBe('mutate_appointment');
      if (intent.kind === 'mutate_appointment') {
        expect(intent.action).toBe('reschedule');
      }
    });

    it('parses PROTECTED command: cancel appointment', () => {
      const intent = parseLocalIntent('Cancel appointment');
      expect(intent.kind).toBe('mutate_appointment');
      if (intent.kind === 'mutate_appointment') {
        expect(intent.action).toBe('cancel');
      }
    });

    it('parses PROTECTED command: confirm appointment', () => {
      const intent = parseLocalIntent('Confirm appointment');
      expect(intent.kind).toBe('mutate_appointment');
      if (intent.kind === 'mutate_appointment') {
        expect(intent.action).toBe('confirm');
      }
    });
  });

  describe('2. READ Commands Execution', () => {
    it("1. today's appointments: fetches today's board without LLM estimation (Level 1)", async () => {
      const result = await specialist.handleTodayAppointments('2026-08-07', doctorContext, mockApptSupplier);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.type).toBe('appointment_board');
      if (result.cards[0]?.type === 'appointment_board') {
        expect(result.cards[0].totalCount).toBe(2);
      }
      expect(result.assistantText).toContain('Found 2 appointments scheduled for today');
    });

    it('2. patient appointment status: requires patient binding context', async () => {
      const unboundResult = await specialist.handlePatientAppointmentStatus(null, unboundContext, mockPatientApptSupplier);

      expect(unboundResult.error).toBe('PATIENT_NOT_BOUND');
      expect(unboundResult.assistantText).toContain('requires a confirmed bound patient session');

      const boundResult = await specialist.handlePatientAppointmentStatus(null, doctorContext, mockPatientApptSupplier);

      expect(boundResult.cards).toHaveLength(1);
      expect(boundResult.assistantText).toContain("Patient appointment on");
      expect(boundResult.assistantText).toContain("'confirmed'");
    });

    it('3. next appointment: returns details of next scheduled appointment', async () => {
      const result = await specialist.handleNextAppointment(doctorContext, mockNextApptSupplier);

      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]?.type).toBe('appointment_item');
      if (result.cards[0]?.type === 'appointment_item') {
        expect(result.cards[0].patientName).toBe('Rahul Patil');
        expect(result.cards[0].status).toBe('pending');
      }
      expect(result.assistantText).toContain('Next appointment is with Rahul Patil');
    });
  });

  describe('3. DRAFT Commands & Authoritative Slot Schedule Rule', () => {
    it('prepares appointment form for an AVAILABLE slot', async () => {
      const input = { date: '2026-08-08', time: '10:30', reason: 'Follow-up' };
      const result = await specialist.handleDraftAppointment(input, doctorContext, mockSlotsSupplier);

      expect(result.uiCommand).toBeDefined();
      expect(result.uiCommand?.type).toBe('OPEN_APPOINTMENT_FORM');

      const parsed = openAppointmentFormCommandSchema.safeParse(result.uiCommand);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.patientId).toBe('65f1a2b3c4d5e6f7a8b9c0d1');
        expect(parsed.data.reason).toBe('Follow-up');
        expect(parsed.data.slotValidated).toBe(true);
      }
      expect(result.assistantText).toContain('Slot verified against clinic schedule');
    });

    it('STRICT RULE: Never invents availability — rejects ALREADY BOOKED slot', async () => {
      const input = { date: '2026-08-08', time: '10:00', reason: 'Consultation' };
      const result = await specialist.handleDraftAppointment(input, doctorContext, mockSlotsSupplier);

      expect(result.error).toBe('SLOT_UNAVAILABLE');
      expect(result.statusCode).toBe(409);
      expect(result.uiCommand).toBeUndefined();
      expect(result.assistantText).toContain('requested time 10:00 on 2026-08-08 is ALREADY BOOKED');
      expect(result.assistantText).toContain('Available slots:');
    });

    it('STRICT RULE: Rejects slot OUTSIDE WORKING HOURS', async () => {
      const input = { date: '2026-08-08', time: '22:00', reason: 'Night checkup' };
      const result = await specialist.handleDraftAppointment(input, doctorContext, mockSlotsSupplier);

      expect(result.error).toBe('OUTSIDE_WORKING_HOURS');
      expect(result.uiCommand).toBeUndefined();
      expect(result.assistantText).toContain('outside clinic working hours');
    });
  });

  describe('4. PROTECTED Commands & Level 3 Confirmation', () => {
    it('1. propose "create" appointment: evaluates Level 3 policy and requires bound patient', async () => {
      const unboundResult = await specialist.proposeAppointmentMutation(
        'create',
        { scheduledAt: '2026-08-08T10:30:00.000+05:30' },
        unboundContext,
        mockSlotsSupplier
      );
      expect(unboundResult.error).toBe('PATIENT_NOT_BOUND');

      const boundResult = await specialist.proposeAppointmentMutation(
        'create',
        { scheduledAt: '2026-08-08T10:30:00.000+05:30' },
        doctorContext,
        mockSlotsSupplier
      );

      expect(boundResult.pendingAction).toBeDefined();
      expect(boundResult.pendingAction?.type).toBe('confirm_appointment_change');
      expect(boundResult.pendingAction?.action).toBe('create');
      expect(boundResult.assistantText).toContain('Please confirm to create new appointment');
    });

    it('2. propose "reschedule" appointment: handles double booking conflict', async () => {
      const conflictResult = await specialist.proposeAppointmentMutation(
        'reschedule',
        { appointmentId: 'app_101', scheduledAt: '2026-08-08T10:00:00.000+05:30' },
        doctorContext,
        mockSlotsSupplier
      );

      expect(conflictResult.error).toBe('DOUBLE_BOOKING');
      expect(conflictResult.statusCode).toBe(409);
      expect(conflictResult.assistantText).toContain('Double booking conflict');
    });

    it('3. propose "cancel" appointment', async () => {
      const result = await specialist.proposeAppointmentMutation(
        'cancel',
        { appointmentId: 'app_101' },
        doctorContext,
        mockSlotsSupplier
      );

      expect(result.pendingAction).toBeDefined();
      expect(result.pendingAction?.action).toBe('cancel');
      expect(result.assistantText).toContain('Please confirm to cancel patient appointment');
    });

    it('4. propose "confirm" appointment', async () => {
      const result = await specialist.proposeAppointmentMutation(
        'confirm',
        { appointmentId: 'app_102' },
        doctorContext,
        mockSlotsSupplier
      );

      expect(result.pendingAction).toBeDefined();
      expect(result.pendingAction?.action).toBe('confirm');
      expect(result.assistantText).toContain('Please confirm to confirm patient appointment status');
    });

    it('5. confirms appointment mutation execution in backend', async () => {
      const proposal = await specialist.proposeAppointmentMutation(
        'create',
        { scheduledAt: '2026-08-08T10:30:00.000+05:30' },
        doctorContext,
        mockSlotsSupplier
      );

      const mockExecutor = vi.fn(async (action: any, _ctx: ToolExecutionContext) => ({
        _id: 'app_new_999',
        status: 'pending',
        scheduledAt: action.scheduledAt,
      }));

      const confirmResult = await specialist.confirmAppointmentMutation(proposal.pendingAction!, doctorContext, mockExecutor);

      expect(confirmResult.success).toBe(true);
      expect(mockExecutor).toHaveBeenCalled();
      expect(confirmResult.assistantText).toContain("Appointment action 'create' completed successfully");
    });
  });
});
