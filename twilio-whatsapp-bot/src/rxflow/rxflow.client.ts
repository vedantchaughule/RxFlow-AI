import { env } from '../config/env.js';
import type {
  RxFlowClinic,
  RxFlowDoctor,
  RxFlowPatientResolveResult,
  RxFlowPatientRegisterResult,
  RxFlowSlotsResult,
  RxFlowAppointmentResult,
} from './rxflow.types.js';

export class RxFlowClient {
  private get baseUrl(): string {
    return process.env.RXFLOW_API_URL || env.RXFLOW_API_URL || 'http://localhost:5000';
  }

  private get serviceKey(): string {
    return process.env.RXFLOW_WHATSAPP_SERVICE_KEY || env.RXFLOW_WHATSAPP_SERVICE_KEY || 'test-service-key-32-chars-long!!';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1/internal/whatsapp-booking${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-RxFlow-Service-Key': this.serviceKey,
        ...options.headers,
      },
    });

    if (!res.ok) {
      let errorDetails = `${res.status} ${res.statusText}`;
      try {
        const errJson = (await res.json()) as any;
        if (errJson?.error?.message) {
          errorDetails += `: ${errJson.error.message}`;
          if (errJson.error.fields) {
            errorDetails += ` (${JSON.stringify(errJson.error.fields)})`;
          }
        } else if (errJson?.message) {
          errorDetails += `: ${errJson.message}`;
        }
      } catch {}
      throw new Error(`RxFlow API call failed: ${errorDetails}`);
    }

    const json = (await res.json()) as { success: boolean; data: T };
    return json.data;
  }

  async getClinicInfo(): Promise<RxFlowClinic> {
    return await this.request<RxFlowClinic>('/clinic');
  }

  async getDoctors(): Promise<RxFlowDoctor[]> {
    return await this.request<RxFlowDoctor[]>('/doctors');
  }

  async resolvePatientByPhone(phone: string): Promise<RxFlowPatientResolveResult> {
    return await this.request<RxFlowPatientResolveResult>('/patients/resolve', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async registerPatient(input: {
    name: string;
    whatsappPhone: string;
    age: number;
    gender: 'male' | 'female' | 'other';
    assignedDoctorId?: string;
    notes?: string;
  }): Promise<RxFlowPatientRegisterResult> {
    return await this.request<RxFlowPatientRegisterResult>('/patients/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getSlots(date: string, doctorId?: string): Promise<RxFlowSlotsResult> {
    const params = new URLSearchParams({ date });
    if (doctorId) params.append('doctorId', doctorId);
    return await this.request<RxFlowSlotsResult>(`/slots?${params.toString()}`);
  }

  async createAppointment(input: {
    patientId: string;
    doctorId: string;
    scheduledAt: string;
    durationMinutes?: number;
    notes?: string;
  }): Promise<RxFlowAppointmentResult> {
    return await this.request<RxFlowAppointmentResult>('/appointments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getAppointmentDetails(appointmentId: string): Promise<RxFlowAppointmentResult> {
    return await this.request<RxFlowAppointmentResult>(`/appointments/${appointmentId}`);
  }

  async getActivePatientAppointment(patientId: string): Promise<RxFlowAppointmentResult | null> {
    return await this.request<RxFlowAppointmentResult | null>(`/appointments/patient/${patientId}/active`);
  }

  async rescheduleAppointment(appointmentId: string, scheduledAt: string): Promise<{ appointmentId: string; status: string; newScheduledAt: string }> {
    return await this.request<{ appointmentId: string; status: string; newScheduledAt: string }>(`/appointments/${appointmentId}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduledAt }),
    });
  }

  async cancelAppointment(appointmentId: string): Promise<{ appointmentId: string; status: string }> {
    return await this.request<{ appointmentId: string; status: string }>(`/appointments/${appointmentId}/cancel`, {
      method: 'POST',
    });
  }

  async sendHandoffAlert(patientId?: string, summary?: string): Promise<{ alertId: string; summary: string }> {
    return await this.request<{ alertId: string; summary: string }>('/handoff', {
      method: 'POST',
      body: JSON.stringify({ patientId, summary }),
    });
  }
}

export const rxflowClient = new RxFlowClient();
