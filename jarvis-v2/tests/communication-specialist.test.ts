import { describe, it, expect, vi } from 'vitest';
import { CommunicationSpecialist } from '../src/specialists/communication-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { parseLocalIntent } from '../src/parser/local-parser.js';

describe('Communications & Reminders Specialist (PROMPT 15)', () => {
  const specialist = new CommunicationSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_doc_comm_101',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: '65f1a2b3c4d5e6f7a8b9c0d1',
    boundQueueEntryId: 'q_curr_101',
    sessionToken: 'token_doc_comm',
  };

  const unboundContext: ToolExecutionContext = {
    sessionId: 'sess_unbound_102',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_unbound',
  };

  // Mock Communication Records
  const mockCommMessages = [
    {
      _id: 'msg_101',
      jobId: 'job_101',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d1',
      recipientPhone: '+919876543210',
      templateName: 'appointment_reminder_24h',
      purpose: 'appointment_reminder',
      status: 'queued',
    },
  ];

  // const _mockCommSupplier = async (patId: string, _ctx: ToolExecutionContext) =>
  //   mockCommMessages.filter((m) => m.patientId === patId);

  const mockConsentSupplierOptedIn = async (_patId: string, _ctx: ToolExecutionContext) => ({
    status: 'opted_in',
    categories: ['appointments', 'prescription_ready'],
  });

  const mockConsentSupplierOptedOut = async (_patId: string, _ctx: ToolExecutionContext) => ({
    status: 'opted_out',
    categories: [],
  });

  describe('1. Intent Parsing', () => {
    it('parses READ command: WhatsApp delivery status', () => {
      const intent = parseLocalIntent('Check WhatsApp delivery status');
      expect(intent.kind).toBe('communication_status');
    });

    it('parses READ command: appointment reminder status', () => {
      const intent = parseLocalIntent('Check appointment reminder status');
      expect(intent.kind).toBe('reminder_status');
    });

    it('parses DRAFT command: prepare message draft', () => {
      const intent = parseLocalIntent('Prepare a message draft for appointment confirmation');
      expect(intent.kind).toBe('draft_communication');
    });

    it('parses PROTECTED command: send notification', () => {
      const intent = parseLocalIntent('Send appointment confirmation via WhatsApp');
      expect(intent.kind).toBe('mutate_communication');
    });
  });

  describe('2. Status Truthfulness Rule', () => {
    it("STRICT RULE: Never claims 'delivered' or 'read' when database status is 'queued' or 'sent'", async () => {
      const queuedMessage = [{ ...mockCommMessages[0], status: 'queued' }];
      const queuedSupplier = async () => queuedMessage;

      const ctxQueued = { ...doctorContext, sessionId: 'sess_doc_comm_queued' };
      const result = await specialist.handleCommunicationStatus(null, ctxQueued, queuedSupplier);

      expect(result.assistantText).not.toContain('DELIVERED');
      expect(result.assistantText).not.toContain('READ');
      expect(result.assistantText).toContain("is QUEUED in notification pipeline");

      const sentMessage = [{ ...mockCommMessages[0], status: 'sent' }];
      const sentSupplier = async () => sentMessage;

      const ctxSent = { ...doctorContext, sessionId: 'sess_doc_comm_sent' };
      const sentResult = await specialist.handleCommunicationStatus(null, ctxSent, sentSupplier);
      expect(sentResult.assistantText).not.toContain('DELIVERED');
      expect(sentResult.assistantText).toContain("has been SENT to Meta WhatsApp Cloud API");
    });

    it("Only claims 'delivered' or 'read' when database status is confirmed by provider webhook", async () => {
      const deliveredMessage = [{ ...mockCommMessages[0], status: 'delivered', deliveredAt: new Date().toISOString() }];
      const deliveredSupplier = async () => deliveredMessage;

      const ctxDelivered = { ...doctorContext, sessionId: 'sess_doc_comm_del' };
      const delResult = await specialist.handleCommunicationStatus(null, ctxDelivered, deliveredSupplier);
      expect(delResult.assistantText).toContain('has been DELIVERED to patient WhatsApp (provider confirmed)');

      const readMessage = [{ ...mockCommMessages[0], status: 'read', readAt: new Date().toISOString() }];
      const readSupplier = async () => readMessage;

      const ctxRead = { ...doctorContext, sessionId: 'sess_doc_comm_read' };
      const readResult = await specialist.handleCommunicationStatus(null, ctxRead, readSupplier);
      expect(readResult.assistantText).toContain('has been READ by patient on WhatsApp (provider confirmed)');
    });
  });

  describe('3. Clinical Content Sanitization Rule', () => {
    it('STRICT RULE: Strips clinical diagnoses and prescription details from generic notification parameters', () => {
      const rawParams = {
        patient_name: 'Priya Sharma',
        appointment_time: '2026-08-08 10:30 AM',
        clinic_name: 'Alpha Clinic',
        diagnosis: 'Acute Bacterial Tonsillitis',
        medicines: 'Amoxicillin 500mg tid',
        doctor_notes: 'Patient exhibits fever and inflammation',
      };

      const sanitized = specialist.sanitizeParameters(rawParams);

      expect(sanitized.patient_name).toBe('Priya Sharma');
      expect(sanitized.appointment_time).toBe('2026-08-08 10:30 AM');
      expect(sanitized.clinic_name).toBe('Alpha Clinic');

      // Clinical fields MUST BE STRIPPED
      expect((sanitized as any).diagnosis).toBeUndefined();
      expect((sanitized as any).medicines).toBeUndefined();
      expect((sanitized as any).doctor_notes).toBeUndefined();
    });
  });

  describe('4. Consent & Patient Binding Rules', () => {
    it('STRICT RULE: Blocks sending notifications when patient has OPTED OUT of communications', async () => {
      const result = await specialist.proposeCommunicationAction(
        'appointment_reminder',
        'appointment_reminder_24h',
        { patient_name: 'Priya Sharma' },
        doctorContext,
        mockConsentSupplierOptedOut
      );

      expect(result.error).toBe('CONSENT_REQUIRED');
      expect(result.statusCode).toBe(403);
      expect(result.pendingAction).toBeUndefined();
      expect(result.assistantText).toContain('patient has OPTED OUT');
    });

    it('requires bound patient session for communication proposals', async () => {
      const result = await specialist.proposeCommunicationAction(
        'appointment_reminder',
        'appointment_reminder_24h',
        { patient_name: 'Priya Sharma' },
        unboundContext,
        mockConsentSupplierOptedIn
      );

      expect(result.error).toBe('PATIENT_NOT_BOUND');
      expect(result.statusCode).toBe(400);
      expect(result.pendingAction).toBeUndefined();
    });
  });

  describe('5. Protected Level 3 Proposals & Idempotency', () => {
    it('proposes notification action as Level 3 pending proposal (No direct model sending)', async () => {
      const result = await specialist.proposeCommunicationAction(
        'appointment_reminder',
        'appointment_reminder_24h',
        { patient_name: 'Priya Sharma', appointment_time: '10:30 AM' },
        doctorContext,
        mockConsentSupplierOptedIn
      );

      expect(result.pendingAction).toBeDefined();
      expect(result.pendingAction?.type).toBe('confirm_communication_job');
      expect(result.pendingAction?.purpose).toBe('appointment_reminder');
      expect(result.pendingAction?.dedupeKey).toBe('appointment:65f1a2b3c4d5e6f7a8b9c0d1:appointment_reminder');
      expect(result.assistantText).toContain('Please confirm to queue WhatsApp appointment_reminder notification');
    });

    it('handles deduplication and ALREADY_QUEUED cleanly upon execution', async () => {
      const proposal = await specialist.proposeCommunicationAction(
        'appointment_reminder',
        'appointment_reminder_24h',
        { patient_name: 'Priya Sharma' },
        doctorContext,
        mockConsentSupplierOptedIn
      );

      const mockAlreadyQueuedExecutor = vi.fn(async (_action: any, _ctx: ToolExecutionContext) => ({
        queued: false,
        reason: 'ALREADY_QUEUED',
      }));

      const confirmResult = await specialist.confirmCommunicationAction(
        proposal.pendingAction!,
        doctorContext,
        mockAlreadyQueuedExecutor
      );

      expect(confirmResult.success).toBe(true);
      expect(confirmResult.assistantText).toContain('Notification is already queued for this patient');
      expect(confirmResult.assistantText).toContain('Duplicate prevented');
    });

    it('successfully executes backend queueCommunication on confirmation', async () => {
      const proposal = await specialist.proposeCommunicationAction(
        'appointment_reminder',
        'appointment_reminder_24h',
        { patient_name: 'Priya Sharma' },
        doctorContext,
        mockConsentSupplierOptedIn
      );

      const mockSuccessExecutor = vi.fn(async (_action: any, _ctx: ToolExecutionContext) => ({
        queued: true,
        messageId: 'msg_backend_777',
      }));

      const confirmResult = await specialist.confirmCommunicationAction(
        proposal.pendingAction!,
        doctorContext,
        mockSuccessExecutor
      );

      expect(confirmResult.success).toBe(true);
      expect(mockSuccessExecutor).toHaveBeenCalled();
      expect(confirmResult.assistantText).toContain('WhatsApp notification successfully queued (Message ID: msg_backend_777)');
    });
  });
});
