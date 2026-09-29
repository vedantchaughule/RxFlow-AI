import { describe, it, expect } from 'vitest';
import { PatientSpecialist } from '../src/specialists/patient-specialist.js';
import type { ToolExecutionContext } from '../src/tools/tool-interface.js';
import { openPatientCommandSchema } from '../src/ui-commands.js';

describe('Patient Search, Bind, & Open Page Specialist (PROMPT 06)', () => {
  const specialist = new PatientSpecialist();

  const doctorAContext: ToolExecutionContext = {
    sessionId: 'sess_docA_123',
    clinicId: 'clinic_alpha',
    doctorId: 'doc_alpha',
    boundPatientId: null,
    boundQueueEntryId: null,
    sessionToken: 'token_docA',
  };

  // Synthetic Patient Database Fixture
  const syntheticPatientsDB = [
    {
      _id: '65f1a2b3c4d5e6f7a8b9c0d1',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d1',
      patientCode: 'RXF-B9C0D1',
      friendlyId: 'RXF-B9C0D1',
      name: 'Rahul Patil',
      age: 34,
      gender: 'Male',
      phone: '9876543210',
      clinicId: 'clinic_alpha',
      assignedDoctorId: 'doc_alpha',
    },
    {
      _id: '65f1a2b3c4d5e6f7a8b9c0d2',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d2',
      patientCode: 'RXF-B9C0D2',
      friendlyId: 'RXF-B9C0D2',
      name: 'Rahul Patil',
      age: 52,
      gender: 'Male',
      phone: '9876543211',
      clinicId: 'clinic_alpha',
      assignedDoctorId: 'doc_alpha',
    },
    {
      _id: '65f1a2b3c4d5e6f7a8b9c0d3',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d3',
      patientCode: 'RXF-B9C0D3',
      friendlyId: 'RXF-B9C0D3',
      name: 'Priya Sharma',
      age: 28,
      gender: 'Female',
      phone: '9876543212',
      clinicId: 'clinic_alpha',
      assignedDoctorId: 'doc_alpha',
    },
    {
      _id: '65f1a2b3c4d5e6f7a8b9c0d4',
      patientId: '65f1a2b3c4d5e6f7a8b9c0d4',
      patientCode: 'RXF-B9C0D4',
      friendlyId: 'RXF-B9C0D4',
      name: 'Cross Clinic Patient',
      clinicId: 'clinic_beta', // Different clinic!
      assignedDoctorId: 'doc_beta',
    },
  ];

  // Synthetic Queue Database Fixture
  const syntheticQueueDB = [
    {
      queueEntryId: 'q_entry_7',
      queueNumber: 7,
      patientId: '65f1a2b3c4d5e6f7a8b9c0d3',
      clinicId: 'clinic_alpha',
      doctorId: 'doc_alpha',
      status: 'in_consultation',
    },
    {
      queueEntryId: 'q_entry_8_wrong_doc',
      queueNumber: 8,
      patientId: '65f1a2b3c4d5e6f7a8b9c0d3',
      clinicId: 'clinic_alpha',
      doctorId: 'doc_beta', // Assigned to Doctor Beta!
      status: 'waiting',
    },
    {
      queueEntryId: 'q_entry_9_stale',
      queueNumber: 9,
      patientId: '65f1a2b3c4d5e6f7a8b9c0d3',
      clinicId: 'clinic_alpha',
      doctorId: 'doc_alpha',
      status: 'completed', // Stale/Completed!
    },
  ];

  // Mock Supplier for Lookup Tool
  const mockSupplier = async (query: string, lookupType: string, ctx: ToolExecutionContext) => {
    const qLower = query.toLowerCase();

    if (lookupType === 'queue_number' || /queue\s*7/i.test(query)) {
      const q = syntheticQueueDB.find(
        (e) => e.queueNumber === 7 && e.clinicId === ctx.clinicId && e.doctorId === ctx.doctorId && e.status !== 'completed'
      );
      if (!q) return [];
      const pat = syntheticPatientsDB.find((p) => p._id === q.patientId && p.clinicId === ctx.clinicId);
      return pat ? [{ ...pat, queueNumber: q.queueNumber, queueEntryId: q.queueEntryId }] : [];
    }

    if (lookupType === 'patient_id' || /^RXF-/i.test(query)) {
      return syntheticPatientsDB.filter(
        (p) => (p.patientCode === query || p.friendlyId === query) && p.clinicId === ctx.clinicId && p.assignedDoctorId === ctx.doctorId
      );
    }

    return syntheticPatientsDB.filter(
      (p) => p.name.toLowerCase().includes(qLower) && p.clinicId === ctx.clinicId && p.assignedDoctorId === ctx.doctorId
    );
  };

  it('1. exact name lookup: returns identity card and pending binding proposal for unique patient', async () => {
    const result = await specialist.handleLookup('Priya Sharma', 'name', doctorAContext, mockSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('patient_identity');
    if (result.cards[0]?.type === 'patient_identity') {
      expect(result.cards[0].name).toBe('Priya Sharma');
      expect(result.cards[0].friendlyId).toBe('RXF-B9C0D3');
      expect(result.cards[0].maskedPhone).toBe('****3212');
    }
    expect(result.pendingAction).toBeDefined();
    expect(result.pendingAction?.type).toBe('confirm_patient_binding');
    expect(result.pendingAction?.patientId).toBe('65f1a2b3c4d5e6f7a8b9c0d3');
  });

  it('2. friendly ID lookup: returns exact match for RXF-B9C0D3', async () => {
    const result = await specialist.handleLookup('RXF-B9C0D3', 'patient_id', doctorAContext, mockSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('patient_identity');
    if (result.cards[0]?.type === 'patient_identity') {
      expect(result.cards[0].friendlyId).toBe('RXF-B9C0D3');
    }
    expect(result.pendingAction?.patientId).toBe('65f1a2b3c4d5e6f7a8b9c0d3');
  });

  it('3. queue number lookup: resolves active queue token #7 to patient and active visit', async () => {
    const result = await specialist.handleLookup('queue 7', 'queue_number', doctorAContext, mockSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('patient_identity');
    if (result.cards[0]?.type === 'patient_identity') {
      expect(result.cards[0].queueNumber).toBe(7);
      expect(result.cards[0].queueEntryId).toBe('q_entry_7');
    }
    expect(result.pendingAction?.queueEntryId).toBe('q_entry_7');
  });

  it('4. duplicate names lookup: returns bounded candidate choice cards when multiple patients match', async () => {
    const result = await specialist.handleLookup('Rahul Patil', 'name', doctorAContext, mockSupplier);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.type).toBe('patient_choices');
    if (result.cards[0]?.type === 'patient_choices') {
      expect(result.cards[0].candidates).toHaveLength(2);
      expect(result.cards[0].candidates[0]?.name).toBe('Rahul Patil');
      expect(result.cards[0].candidates[1]?.name).toBe('Rahul Patil');
    }
    expect(result.pendingAction).toBeNull();
  });

  it('5. no match lookup: returns clear no match response when query does not exist', async () => {
    const result = await specialist.handleLookup('NonExistent Patient Name', 'name', doctorAContext, mockSupplier);

    expect(result.cards).toHaveLength(0);
    expect(result.assistantText).toContain('No patient matching');
    expect(result.pendingAction).toBeNull();
  });

  it('6. cross-clinic isolation: rejects looking up patient from another clinic (Clinic Beta)', async () => {
    const result = await specialist.handleLookup('Cross Clinic Patient', 'name', doctorAContext, mockSupplier);

    // Cross Clinic Patient is in clinic_beta, so Doctor A (clinic_alpha) gets no match
    expect(result.cards).toHaveLength(0);
    expect(result.assistantText).toContain('No patient matching');
  });

  it('7. wrong doctor queue rejection: rejects binding to queue entry assigned to another doctor', async () => {
    const mockValidator = async (_patId: string, qId?: string, ctx?: ToolExecutionContext) => {
      const q = syntheticQueueDB.find((e) => e.queueEntryId === qId);
      if (q && q.doctorId !== ctx?.doctorId) {
        return { valid: false, errorReason: 'Queue entry belongs to another doctor' };
      }
      return { valid: true };
    };

    const confirmRes = await specialist.confirmBinding('65f1a2b3c4d5e6f7a8b9c0d3', 'q_entry_8_wrong_doc', doctorAContext, mockValidator);

    expect(confirmRes.success).toBe(false);
    expect(confirmRes.error).toBe('Queue entry belongs to another doctor');
    expect(confirmRes.uiCommand).toBeUndefined();
  });

  it('8. stale queue entry rejection: rejects binding when queue entry status is completed', async () => {
    const mockValidator = async (_patId: string, qId?: string, _ctx?: ToolExecutionContext) => {
      const q = syntheticQueueDB.find((e) => e.queueEntryId === qId);
      if (q && q.status === 'completed') {
        return { valid: false, errorReason: 'The consultation queue entry is no longer active' };
      }
      return { valid: true };
    };

    const confirmRes = await specialist.confirmBinding('65f1a2b3c4d5e6f7a8b9c0d3', 'q_entry_9_stale', doctorAContext, mockValidator);

    expect(confirmRes.success).toBe(false);
    expect(confirmRes.error).toBe('The consultation queue entry is no longer active');
    expect(confirmRes.uiCommand).toBeUndefined();
  });

  it('9. typed UI navigation: emits OPEN_PATIENT command upon successful binding confirmation', async () => {
    const confirmRes = await specialist.confirmBinding('65f1a2b3c4d5e6f7a8b9c0d3', 'q_entry_7', doctorAContext);

    expect(confirmRes.success).toBe(true);
    expect(confirmRes.boundPatientId).toBe('65f1a2b3c4d5e6f7a8b9c0d3');
    expect(confirmRes.boundQueueEntryId).toBe('q_entry_7');
    expect(confirmRes.uiCommand).toBeDefined();
    expect(confirmRes.uiCommand?.type).toBe('OPEN_PATIENT');

    const parsedCmd = openPatientCommandSchema.safeParse(confirmRes.uiCommand);
    expect(parsedCmd.success).toBe(true);
    if (parsedCmd.success) {
      expect(parsedCmd.data.patientId).toBe('65f1a2b3c4d5e6f7a8b9c0d3');
      expect(parsedCmd.data.friendlyId).toBe('RXF-B9C0D3');
      expect(parsedCmd.data.queueEntryId).toBe('q_entry_7');
    }
  });
});
