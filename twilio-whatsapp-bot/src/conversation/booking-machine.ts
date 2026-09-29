import type { ConversationSession, BookingState } from './conversation.types.js';

export interface TransitionResult {
  updatedSession: ConversationSession;
  replyText: string;
}

/**
 * Pure, deterministic state machine for WhatsApp appointment booking.
 * No AI model. No external calls. Just state + input → next state + reply.
 *
 * External API calls (patient resolution, slot fetching, booking creation)
 * are handled by conversation.service.ts BEFORE and AFTER this function.
 */
export function handleStateTransition(
  session: ConversationSession,
  incomingText: string
): TransitionResult {
  const text = incomingText.trim();
  const textLower = text.toLowerCase();

  // ─── Global Commands & Commands (PROMPT 19) ──────────────────────
  if (textLower === 'cancel' || textLower === 'stop' || textLower === 'exit' || textLower === 'quit') {
    if (session.data.appointmentId && textLower === 'cancel') {
      return transition(session, 'CONFIRM_CANCEL', {},
        '⚠️ *Cancel appointment?*\n\n1️⃣ Yes, cancel\n2️⃣ Keep appointment');
    }
    return {
      updatedSession: { ...session, state: 'CANCELLED', data: {}, updatedAt: Date.now() },
      replyText: '❌ Your appointment booking session has been cancelled.\n\nSend *Hi* anytime to start again.',
    };
  }

  if (textLower === 'help' || textLower === 'support' || textLower === 'agent' || textLower === 'person' || textLower === 'reception') {
    return transition(session, 'HANDOFF', {},
      '🤝 Connecting you with our clinic reception staff. A team member will reach out shortly to assist you.\n\nFor urgent care, please call the clinic directly.');
  }

  if (textLower === 'my appointment' || textLower === 'status' || textLower === 'check appointment') {
    return transition(session, 'IDENTIFY_PATIENT', { isQueryingStatus: true, isRescheduling: false, isCancelling: false },
      '🔍 Checking your active appointment status...');
  }

  if (textLower === 'change' || textLower === 'reschedule' || textLower === 'reschedule appointment') {
    return transition(session, 'IDENTIFY_PATIENT', { isRescheduling: true, isQueryingStatus: false, isCancelling: false },
      '🔄 Preparing to reschedule your appointment...');
  }

  if (textLower === 'book' || textLower === 'book appointment') {
    return transition(session, 'IDENTIFY_PATIENT', { isQueryingStatus: false, isRescheduling: false, isCancelling: false },
      '📋 Starting appointment booking.\n\nLet me check if you\'re already registered with us...');
  }

  if (textLower === 'restart' || textLower === 'start over') {
    return transition(session, 'WELCOME', {},
      welcomeMessage(session.clinicId));
  }

  // ─── State Handlers ──────────────────────────────────────────
  switch (session.state) {
    case 'WELCOME':
      return handleWelcome(session, textLower);

    case 'IDENTIFY_PATIENT':
      // This state is handled by the service layer (API call).
      // The machine just waits — service will advance state after resolution.
      return stay(session, '⏳ Looking up your records...');

    case 'ASK_NAME':
      return handleAskName(session, text);

    case 'ASK_AGE':
      return handleAskAge(session, text);

    case 'ASK_GENDER':
      return handleAskGender(session, textLower);

    case 'SELECT_DOCTOR':
      return handleSelectDoctor(session, text);

    case 'SELECT_DATE':
      return handleSelectDate(session, text);

    case 'SHOW_SLOTS':
      // Handled by service layer (API call to fetch slots).
      return stay(session, '⏳ Fetching available slots...');

    case 'SELECT_SLOT':
      return handleSelectSlot(session, text);

    case 'CONFIRM_BOOKING':
      return handleConfirmBooking(session, textLower);

    case 'CONFIRM_CANCEL':
      return handleConfirmCancel(session, textLower);

    case 'BOOKING':
      // Handled by service layer (API call to create appointment).
      return stay(session, '⏳ Booking your appointment...');

    case 'BOOKED':
      return handleBooked(session, textLower);

    case 'CANCELLED':
      // Re-entering after cancel → restart
      return transition(session, 'WELCOME', {},
        welcomeMessage(session.clinicId));

    case 'HANDOFF':
      return stay(session,
        '🤝 You\'ve been connected to our clinic staff. A team member will respond shortly.\n\nSend *restart* to begin a new booking.');

    case 'ERROR':
      return transition(session, 'WELCOME', {},
        '⚠️ Something went wrong earlier. Let\'s start fresh.\n\n' + welcomeMessage(session.clinicId));

    default:
      return transition(session, 'WELCOME', {},
        welcomeMessage(session.clinicId));
  }
}

// ─── State Handlers ──────────────────────────────────────────────

function handleWelcome(session: ConversationSession, text: string): TransitionResult {
  if (text.includes('1') || text.includes('book')) {
    return transition(session, 'IDENTIFY_PATIENT', {},
      '📋 Starting appointment booking.\n\nLet me check if you\'re already registered with us...');
  }

  if (text.includes('2') || text.includes('check')) {
    return stay(session,
      '📅 To check an existing appointment, please visit the clinic or contact the front desk.\n\nReply *1* to book a new appointment.');
  }

  if (text.includes('3') || text.includes('help') || text.includes('human') || text.includes('staff')) {
    return transition(session, 'HANDOFF', {},
      '🤝 Connecting you with our clinic staff. A team member will respond shortly.');
  }

  return stay(session, welcomeMessage(session.clinicId));
}

function handleAskName(session: ConversationSession, text: string): TransitionResult {
  const name = text.trim();
  if (name.length < 2 || name.length > 100) {
    return stay(session, '❌ Please enter a valid name (2-100 characters).');
  }

  return transition(session, 'ASK_AGE', { patientName: name, isNewPatient: true },
    `Thank you, *${name}*.\n\nPlease enter your *age* (e.g., 25):`);
}

function handleAskAge(session: ConversationSession, text: string): TransitionResult {
  const age = parseInt(text, 10);
  if (isNaN(age) || age < 0 || age > 150) {
    return stay(session, '❌ Please enter a valid age (0-150).');
  }

  return transition(session, 'ASK_GENDER', { patientAge: age },
    `Age: *${age}*\n\nPlease select your *gender*:\n\n1️⃣ Male\n2️⃣ Female\n3️⃣ Other`);
}

function handleAskGender(session: ConversationSession, text: string): TransitionResult {
  let gender: string;
  if (text.includes('1') || text.includes('male') && !text.includes('female')) {
    gender = 'male';
  } else if (text.includes('2') || text.includes('female')) {
    gender = 'female';
  } else if (text.includes('3') || text.includes('other')) {
    gender = 'other';
  } else {
    return stay(session, '❌ Please reply *1* (Male), *2* (Female), or *3* (Other).');
  }

  return transition(session, 'SELECT_DOCTOR', { patientGender: gender },
    '⏳ Profile saved. Loading available doctors...');
}

function handleSelectDoctor(session: ConversationSession, text: string): TransitionResult {
  const doctors = session.data.availableDoctors || [];
  if (doctors.length === 0) {
    return transition(session, 'ERROR', {},
      '⚠️ No doctors are currently available. Please try again later.');
  }

  const choice = parseInt(text, 10);
  if (isNaN(choice) || choice < 1 || choice > doctors.length) {
    return stay(session,
      `❌ Please reply with a number from 1 to ${doctors.length}.\n\n${buildDoctorListMessage(session)}`);
  }

  const selected = doctors[choice - 1];
  return transition(session, 'SELECT_DATE',
    { doctorId: selected.doctorId, doctorName: selected.name },
    `✅ Selected Dr. *${selected.name}*\n\nPlease enter your preferred *date*:\n\n` +
    `📅 Format: DD/MM/YYYY (e.g., ${formatFutureDate()})\n\nOr reply *today* or *tomorrow*.`);
}

function handleSelectDate(session: ConversationSession, text: string): TransitionResult {
  const textLower = text.toLowerCase().trim();
  let dateStr: string;

  const now = new Date();

  if (textLower === 'today') {
    dateStr = formatDateYMD(now);
  } else if (textLower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateStr = formatDateYMD(tomorrow);
  } else {
    // Parse DD/MM/YYYY
    const parts = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (!parts) {
      return stay(session,
        '❌ Invalid date format. Please use *DD/MM/YYYY* (e.g., 15/08/2026), or reply *today* / *tomorrow*.');
    }
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10);
    const year = parseInt(parts[3], 10);

    const parsed = new Date(year, month - 1, day);
    if (isNaN(parsed.getTime()) || parsed < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      return stay(session, '❌ Date cannot be in the past. Please enter a future date.');
    }
    dateStr = formatDateYMD(parsed);
  }

  return transition(session, 'SHOW_SLOTS', { selectedDate: dateStr },
    `📅 Date: *${dateStr}*\n\n⏳ Fetching available slots for Dr. ${session.data.doctorName}...`);
}

function handleSelectSlot(session: ConversationSession, text: string): TransitionResult {
  const allSlots = session.data.allSlots || session.data.availableSlots || [];
  if (allSlots.length === 0) {
    return transition(session, 'SELECT_DATE', { availableSlots: undefined, allSlots: undefined },
      '⚠️ No slots available on this date. Please pick another date:\n\n📅 Format: DD/MM/YYYY');
  }

  const currentPage = session.data.slotPage || 0;
  const pageSize = 10;
  const totalPages = Math.ceil(allSlots.length / pageSize);

  const textLower = text.trim().toLowerCase();

  if (textLower === 'm' || textLower === 'more' || textLower === 'more times') {
    if (currentPage + 1 < totalPages) {
      const nextPage = currentPage + 1;
      const pageSlots = allSlots.slice(nextPage * pageSize, (nextPage + 1) * pageSize);
      const slotListStr = pageSlots.map((s, i) => `${i + 1}️⃣ ${s.time}`).join('\n');
      const hasMore = nextPage + 1 < totalPages;
      const footer = hasMore ? '\n\nReply *M* for More times, or *B* for Previous times.' : '\n\nReply *B* for Previous times.';

      return transition(session, 'SELECT_SLOT',
        { slotPage: nextPage, availableSlots: pageSlots },
        `🕐 Available slots (Page ${nextPage + 1}/${totalPages}):\n\n${slotListStr}${footer}`);
    }
  }

  if (textLower === 'b' || textLower === 'back' || textLower === 'previous') {
    if (currentPage > 0) {
      const prevPage = currentPage - 1;
      const pageSlots = allSlots.slice(prevPage * pageSize, (prevPage + 1) * pageSize);
      const slotListStr = pageSlots.map((s, i) => `${i + 1}️⃣ ${s.time}`).join('\n');
      const footer = prevPage > 0 ? '\n\nReply *M* for More times, or *B* for Previous times.' : '\n\nReply *M* for More times.';

      return transition(session, 'SELECT_SLOT',
        { slotPage: prevPage, availableSlots: pageSlots },
        `🕐 Available slots (Page ${prevPage + 1}/${totalPages}):\n\n${slotListStr}${footer}`);
    }
  }

  const activeSlots = session.data.availableSlots || allSlots.slice(0, pageSize);
  const choice = parseInt(text, 10);
  if (isNaN(choice) || choice < 1 || choice > activeSlots.length) {
    return stay(session,
      `❌ Please reply with a number from 1 to ${activeSlots.length}.`);
  }

  const selected = activeSlots[choice - 1];
  return transition(session, 'CONFIRM_BOOKING',
    { selectedSlotTime: selected.time, scheduledAt: selected.iso },
    buildConfirmationMessage(session, selected.time));
}

function handleConfirmBooking(session: ConversationSession, text: string): TransitionResult {
  const textLower = text.toLowerCase().trim();

  if (textLower.includes('confirm') || textLower.includes('yes') || textLower === '1' || textLower === 'y') {
    return transition(session, 'BOOKING', {},
      '⏳ Booking your appointment now...');
  }

  if (textLower.includes('change') || textLower.includes('time') || textLower.includes('no') || textLower === '2' || textLower === 'n') {
    return transition(session, 'SHOW_SLOTS',
      { selectedSlotTime: undefined, scheduledAt: undefined },
      '📅 Returning to slot selection.\n\n⏳ Fetching available slots...');
  }

  if (textLower.includes('cancel') || textLower === '3') {
    return {
      updatedSession: { ...session, state: 'CANCELLED', data: {}, updatedAt: Date.now() },
      replyText: '❌ Booking cancelled. Send *Hi* anytime to start over.',
    };
  }

  return stay(session,
    `❌ Please reply:\n1️⃣ *Confirm*\n2️⃣ *Change time*\n3️⃣ *Cancel*`);
}

function handleBooked(session: ConversationSession, text: string): TransitionResult {
  if (text.includes('1') || text.includes('another') || text.includes('book')) {
    return transition(session, 'SELECT_DOCTOR', {
      appointmentId: undefined, selectedDate: undefined,
      selectedSlotTime: undefined, scheduledAt: undefined, availableSlots: undefined,
    }, buildDoctorListMessage(session));
  }

  return stay(session,
    '✅ Your appointment is confirmed!\n\n' +
    'Reply *1* to book another appointment, or *cancel* to exit.\n' +
    'You\'ll receive a reminder before your appointment.');
}

// ─── Helpers ────────────────────────────────────────────────────

function welcomeMessage(_clinicId?: string): string {
  return (
    `👋 Welcome to *RxFlow Clinic*!\n` +
    `I can help you book an appointment.\n\n` +
    `1️⃣ Book appointment\n` +
    `2️⃣ Check appointment\n` +
    `3️⃣ Talk to staff\n\n` +
    `Reply with a number to continue.`
  );
}

function buildDoctorListMessage(session: ConversationSession): string {
  const doctors = session.data.availableDoctors || [];
  if (doctors.length === 0) {
    return '⚠️ No doctors are currently available. Please try again later.';
  }

  const list = doctors
    .map((d, i) => `${i + 1}️⃣ Dr. ${d.name}${d.specialty ? ` (${d.specialty})` : ''}`)
    .join('\n');

  return `👨‍⚕️ Please select a *doctor*:\n\n${list}\n\nReply with the number.`;
}

function buildConfirmationMessage(session: ConversationSession, slotTime: string): string {
  const d = session.data;
  return (
    `📋 *Please confirm your appointment details:*\n\n` +
    `👤 Patient: *${d.patientName || 'N/A'}*\n` +
    `👨‍⚕️ Doctor: *Dr. ${d.doctorName || 'N/A'}*\n` +
    `📅 Date: *${d.selectedDate || 'N/A'}*\n` +
    `🕐 Time: *${slotTime}*\n` +
    `⏱️ Duration: *15 minutes*\n\n` +
    `1️⃣ Confirm\n` +
    `2️⃣ Change time\n` +
    `3️⃣ Cancel`
  );
}

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function handleConfirmCancel(session: ConversationSession, text: string): TransitionResult {
  if (text.includes('1') || text.includes('yes') || text.includes('cancel')) {
    return transition(session, 'CANCELLED', {},
      '✅ Your appointment has been cancelled.\n\nReply *BOOK* anytime if you wish to schedule a new appointment.');
  }

  return transition(session, 'BOOKED', {},
    '👍 Your appointment is kept and remains active.\n\nReply *MY APPOINTMENT* to view your details.');
}

function formatFutureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── Transition Utilities ───────────────────────────────────────

function transition(
  session: ConversationSession,
  newState: BookingState,
  mergeData: Partial<ConversationSession['data']>,
  replyText: string
): TransitionResult {
  return {
    updatedSession: {
      ...session,
      state: newState,
      data: { ...session.data, ...mergeData },
      updatedAt: Date.now(),
    },
    replyText,
  };
}

function stay(session: ConversationSession, replyText: string): TransitionResult {
  return {
    updatedSession: { ...session, updatedAt: Date.now() },
    replyText,
  };
}
