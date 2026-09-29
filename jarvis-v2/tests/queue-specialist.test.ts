import { describe, it, expect } from 'vitest';
import { QueueSpecialist } from '../src/specialists/queue-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { openPatientCommandSchema, showQueueCommandSchema } from '../src/ui-commands.js';

describe('Queue Control Specialist (PROMPT 07)', () => {
  const specialist = new QueueSpecialist();

  const doctorContext: ToolExecutionContext = {
    sessionId: 'sess_doc_queue_123',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_doc_queue',
  };

  // Synthetic Backend Queue Data Fixture
  const mockBackendQueueData = {
    totalWaiting: 4,
    inConsultation: 1,
    currentPatient: {
      queueEntryId: 'q_curr_101',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d1',
      patientName: 'Priya Sharma',
      tokenNumber: 3,
    },
    nextPatient: {
      queueEntryId: 'q_next_102',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d2',
      patientName: 'Rahul Patil',
      tokenNumber: 4,
    },
    queueList: [
      { queueEntryId: 'q_curr_101', patientId: '65f1a2b3c4d5e6f7a8b9c0d1', patientName: 'Priya Sharma', tokenNumber: 3, status: 'in_consultation' },
      { queueEntryId: 'q_next_102', patientId: '65f1a2b3c4d5e6f7a8b9c0d2', patientName: 'Rahul Patil', tokenNumber: 4, status: 'waiting' },
      { queueEntryId: 'q_wait_103', patientId: '65f1a2b3c4d5e6f7a8b9c0d3', patientName: 'Amit Shah', tokenNumber: 5, status: 'waiting' },
      { queueEntryId: 'q_wait_104', patientId: '65f1a2b3c4d5e6f7a8b9c0d4', patientName: 'Sunita Rao', tokenNumber: 6, status: 'waiting' },
    ],
  };

  const mockQueueSupplier = async (_ctx: ToolExecutionContext) => mockBackendQueueData;

  it('1. "How many patients are left?": returns exact backend counts without LLM estimation', async () => {
    const result = await specialist.handleQueueQuery('remaining', doctorContext, mockQueueSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('queue_summary');
    if (result.cards[0]?.type === 'queue_summary') {
      expect(result.cards[0].totalWaiting).toBe(4);
      expect(result.cards[0].inConsultation).toBe(1);
    }
    expect(result.assistantText).toContain('4 patients waiting in your queue');
    expect(result.assistantText).toContain('1 patient currently in consultation');
    expect(result.pendingAction).toBeNull();
  });

  it('2. "Who is next?": returns exact next patient details and token number card', async () => {
    const result = await specialist.handleQueueQuery('next', doctorContext, mockQueueSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('next_patient');
    if (result.cards[0]?.type === 'next_patient') {
      expect(result.cards[0].patientName).toBe('Rahul Patil');
      expect(result.cards[0].tokenNumber).toBe(4);
      expect(result.cards[0].queueEntryId).toBe('q_next_102');
    }
    expect(result.assistantText).toContain('Next patient in line is Rahul Patil (Token #4)');
  });

  it('3. "Show my queue.": returns queue list card and emits SHOW_QUEUE typed UI command', async () => {
    const result = await specialist.handleQueueQuery('list', doctorContext, mockQueueSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('queue_list');
    if (result.cards[0]?.type === 'queue_list') {
      expect(result.cards[0].entries).toHaveLength(4);
    }
    expect(result.uiCommand).toBeDefined();
    expect(result.uiCommand?.type).toBe('SHOW_QUEUE');

    const parsedCmd = showQueueCommandSchema.safeParse(result.uiCommand);
    expect(parsedCmd.success).toBe(true);
  });

  it('4. "Open the current patient.": emits OPEN_PATIENT UI command when patient is in consultation', async () => {
    const result = await specialist.handleQueueQuery('current', doctorContext, mockQueueSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('current_patient');
    if (result.cards[0]?.type === 'current_patient') {
      expect(result.cards[0].patientName).toBe('Priya Sharma');
      expect(result.cards[0].tokenNumber).toBe(3);
    }
    expect(result.uiCommand).toBeDefined();
    expect(result.uiCommand?.type).toBe('OPEN_PATIENT');

    const parsedCmd = openPatientCommandSchema.safeParse(result.uiCommand);
    expect(parsedCmd.success).toBe(true);
    if (parsedCmd.success) {
      expect(parsedCmd.data.patientId).toBe('65f1a2b3c4d5e6f7a8b9c0d1');
      expect(parsedCmd.data.friendlyId).toBe('RXF-B9C0D1');
      expect(parsedCmd.data.queueEntryId).toBe('q_curr_101');
    }
  });

  it('5. "Open current patient" when no patient in consultation: returns clear message and next in line', async () => {
    const emptyCurrentSupplier = async () => ({
      totalWaiting: 2,
      inConsultation: 0,
      currentPatient: null,
      nextPatient: {
        queueEntryId: 'q_next_200',
        patientId: '65f1a2b3c4d5e6f7a8b9c0d9',
        patientName: 'Karan Mehra',
        tokenNumber: 1,
      },
      queueList: [],
    });

    const result = await specialist.handleQueueQuery('current', doctorContext, emptyCurrentSupplier);

    expect(result.uiCommand).toBeUndefined();
    expect(result.assistantText).toContain('There is no patient currently in consultation');
    expect(result.assistantText).toContain('Next patient in line is Karan Mehra');
  });

  it('6. Queue status mutation: enforces Level 3 policy and requires explicit doctor confirmation', () => {
    const result = specialist.proposeStatusChange('q_next_102', 'in_consultation', doctorContext);

    expect(result.pendingAction).toBeDefined();
    expect(result.pendingAction?.type).toBe('confirm_queue_status_change');
    expect(result.pendingAction?.queueEntryId).toBe('q_next_102');
    expect(result.pendingAction?.targetStatus).toBe('in_consultation');
    expect(result.assistantText).toContain("confirm to transition queue entry status to 'in_consultation'");
  });
});
