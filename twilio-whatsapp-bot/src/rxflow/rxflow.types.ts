export interface RxFlowClinic {
  id: string;
  name: string;
  phone: string;
  workingHours: {
    start: string;
    end: string;
    breakStart: string;
    breakEnd: string;
  };
}

export interface RxFlowDoctor {
  doctorId: string;
  name: string;
  specialty?: string;
  isAvailable: boolean;
}

export interface RxFlowPatientResolveResult {
  status: 'EXACT_MATCH' | 'NOT_FOUND';
  patient?: {
    patientId: string;
    name: string;
    assignedDoctorId?: string;
  };
}

export interface RxFlowPatientRegisterResult {
  patientId: string;
  name: string;
  isExisting: boolean;
}

export interface RxFlowSlot {
  time: string;
  iso: string;
}

export interface RxFlowSlotsResult {
  date: string;
  availableCount: number;
  slots: RxFlowSlot[];
}

export interface RxFlowAppointmentResult {
  appointmentId: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
}
