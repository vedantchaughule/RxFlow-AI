export type BookingState =
  | 'WELCOME'
  | 'IDENTIFY_PATIENT'
  | 'ASK_NAME'
  | 'ASK_AGE'
  | 'ASK_GENDER'
  | 'SELECT_DOCTOR'
  | 'SELECT_DATE'
  | 'SHOW_SLOTS'
  | 'SELECT_SLOT'
  | 'CONFIRM_BOOKING'
  | 'CONFIRM_CANCEL'
  | 'BOOKING'
  | 'BOOKED'
  | 'CANCELLED'
  | 'HANDOFF'
  | 'ERROR';

export interface BookingData {
  /** Resolved or newly-registered patient ID from RxFlow */
  patientId?: string;
  /** Display name for the patient */
  patientName?: string;
  /** Patient age (collected during registration) */
  patientAge?: number;
  /** Patient gender (collected during registration) */
  patientGender?: string;
  /** Assigned primary doctor ID for resolved existing patients */
  assignedDoctorId?: string;
  /** Selected doctor's ID */
  doctorId?: string;
  /** Selected doctor's display name */
  doctorName?: string;
  /** Date selected for appointment (YYYY-MM-DD) */
  selectedDate?: string;
  /** Human-readable slot time (e.g., "10:30 AM") */
  selectedSlotTime?: string;
  /** ISO timestamp for the scheduled appointment */
  scheduledAt?: string;
  /** Created appointment ID from RxFlow */
  appointmentId?: string;
  /** Timestamp of the last inbound patient message for 24-hour window validation */
  lastPatientMessageAt?: string;
  /** Flags for command routing */
  isQueryingStatus?: boolean;
  isRescheduling?: boolean;
  isCancelling?: boolean;
  rescheduleAppointmentId?: string;
  /** Brief reason for visit */
  bookingReason?: string;
  /** Available doctors list (cached during SELECT_DOCTOR) */
  availableDoctors?: Array<{ doctorId: string; name: string; specialty?: string }>;
  /** All available slots returned by RxFlow */
  allSlots?: Array<{ time: string; iso: string }>;
  /** Currently displayed slots page (10 slots per page) */
  slotPage?: number;
  /** Available slots list (cached during SHOW_SLOTS) */
  availableSlots?: Array<{ time: string; iso: string }>;
  /** Whether the patient is existing or new */
  isNewPatient?: boolean;
}

/**
 * A single conversation session, keyed by clinic + WhatsApp phone.
 * Never stores passwords, Twilio auth tokens, or clinical information.
 */
export interface ConversationSession {
  /** Unique session identifier */
  sessionId: string;
  /** Normalized WhatsApp phone (+91XXXXXXXXXX) */
  whatsappPhone: string;
  /** Clinic this conversation belongs to */
  clinicId: string;
  /** Current state in the booking state machine */
  state: BookingState;
  /** Accumulated booking data — only what's needed for the booking flow */
  data: BookingData;
  /** Epoch ms of last activity — used for TTL expiry */
  updatedAt: number;
}
