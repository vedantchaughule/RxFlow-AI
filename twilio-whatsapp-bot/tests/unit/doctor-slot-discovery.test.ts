import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundMessage } from '../../src/conversation/conversation.service.js';
import { conversationStore } from '../../src/conversation/conversation.store.js';
import { rxflowClient } from '../../src/rxflow/rxflow.client.js';

describe('Doctor & Slot Discovery (PROMPT 08)', () => {
  beforeEach(async () => {
    conversationStore.clear();
    vi.restoreAllMocks();
  });

  it('fetches doctors, handles date input (today/tomorrow/DD-MM-YYYY), caps slots to 8, and prompts for re-selection if empty', async () => {
    // 1. Resolve existing patient
    vi.spyOn(rxflowClient, 'resolvePatientByPhone').mockResolvedValue({
      status: 'EXACT_MATCH',
      patient: { patientId: 'p_101', name: 'Vikram', assignedDoctorId: 'doc_1' },
    });

    vi.spyOn(rxflowClient, 'getDoctors').mockResolvedValue([
      { doctorId: 'doc_1', name: 'Sharma', specialty: 'General', isAvailable: true },
      { doctorId: 'doc_2', name: 'Mehta', specialty: 'ENT', isAvailable: true },
    ]);

    await processInboundMessage('whatsapp:+919876543210', '1');

    // 2. Select Doctor 1 (Dr. Sharma) -> state moves to SELECT_DATE
    const datePrompt = await processInboundMessage('whatsapp:+919876543210', '1');
    expect(datePrompt).toContain('Selected Dr. *Sharma*');
    expect(datePrompt).toContain('preferred *date*');

    // Mock slots response with 12 slots (should be capped to 8)
    const mock12Slots = Array.from({ length: 12 }, (_, i) => ({
      time: `09:${String(i * 15 % 60).padStart(2, '0')}`,
      iso: `2026-08-20T09:${String(i * 15 % 60).padStart(2, '0')}:00.000+05:30`,
    }));

    const slotsSpy = vi.spyOn(rxflowClient, 'getSlots').mockResolvedValue({
      date: '2026-08-20',
      availableCount: 12,
      slots: mock12Slots,
    });

    // 3. User selects "tomorrow" -> state moves to SHOW_SLOTS -> fetches slots and limits page to 10 with "More times"
    const slotPrompt = await processInboundMessage('whatsapp:+919876543210', 'tomorrow');
    expect(slotsSpy).toHaveBeenCalled();
    expect(slotPrompt).toContain('Available slots for Dr. *Sharma*');
    expect(slotPrompt).toContain('1️⃣');
    expect(slotPrompt).toContain('10️⃣');
    expect(slotPrompt).toContain('More times');

    const session = await conversationStore.getSession('default:+919876543210');
    expect(session?.state).toBe('SELECT_SLOT');
    expect(session?.data.availableSlots?.length).toBe(10);
    expect(session?.data.allSlots?.length).toBe(12);

    // 4. User replies "M" for More times -> shows page 2 (slots 11 & 12)
    const page2Prompt = await processInboundMessage('whatsapp:+919876543210', 'M');
    expect(page2Prompt).toContain('Available slots (Page 2/2)');
    expect(page2Prompt).toContain('1️⃣');
    expect(page2Prompt).toContain('2️⃣');
    expect(page2Prompt).toContain('Previous times');
  });

  it('prompts patient for another date if zero slots exist', async () => {
    vi.spyOn(rxflowClient, 'resolvePatientByPhone').mockResolvedValue({
      status: 'EXACT_MATCH',
      patient: { patientId: 'p_101', name: 'Vikram' },
    });

    vi.spyOn(rxflowClient, 'getDoctors').mockResolvedValue([
      { doctorId: 'doc_1', name: 'Sharma', specialty: 'General', isAvailable: true },
    ]);

    await processInboundMessage('whatsapp:+919876543210', '1'); // Welcome -> resolve
    await processInboundMessage('whatsapp:+919876543210', '1'); // Select doctor -> SELECT_DATE

    // Mock empty slots response
    vi.spyOn(rxflowClient, 'getSlots').mockResolvedValue({
      date: '2026-08-25',
      availableCount: 0,
      slots: [],
    });

    const reply = await processInboundMessage('whatsapp:+919876543210', 'today');
    expect(reply).toContain('No available slots');
    expect(reply).toContain('pick a different date');

    const session = await conversationStore.getSession('default:+919876543210');
    expect(session?.state).toBe('SELECT_DATE');
  });
});
