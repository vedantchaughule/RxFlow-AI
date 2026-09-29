import type { Page, Route } from '@playwright/test';

export type MockRole = 'admin' | 'doctor' | 'receptionist';
export type MockApiState = 'ready' | 'empty' | 'error' | 'forbidden' | 'session-expired' | 'account-disabled';

const users: Record<MockRole, { _id: string; name: string; email: string; role: MockRole; status: 'active'; mustChangePassword: false; mfaEnrolled: false }> = {
  admin: { _id: 'mock-admin', name: 'Ananya Rao', email: 'admin@example.test', role: 'admin', status: 'active', mustChangePassword: false, mfaEnrolled: false },
  doctor: { _id: 'mock-doctor', name: 'Dev Mehta', email: 'doctor@example.test', role: 'doctor', status: 'active', mustChangePassword: false, mfaEnrolled: false },
  receptionist: { _id: 'mock-receptionist', name: 'Riya Shah', email: 'reception@example.test', role: 'receptionist', status: 'active', mustChangePassword: false, mfaEnrolled: false },
};

const json = (route: Route, status: number, body: unknown) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

export async function mockAuthenticatedApi(page: Page, role: MockRole, state: MockApiState = 'ready'): Promise<void> {
  let sessionEstablished = false;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => json(route, 200, { success: true, data });
    const error = (status: number, code: string, message: string) => json(route, status, { success: false, error: { code, message } });

    if (path.endsWith('/auth/refresh')) {
      sessionEstablished = true;
      return ok({ accessToken: 'mock-access-token' });
    }
    if (path.endsWith('/auth/me')) return ok({ user: users[role] });
    if (state === 'session-expired' && sessionEstablished && path.endsWith('/patients/queue')) {
      return error(401, 'SESSION_EXPIRED', 'Session expired');
    }
    if (state === 'account-disabled' && sessionEstablished && path.endsWith('/patients/queue')) {
      return error(401, 'ACCOUNT_DISABLED', 'Account disabled');
    }
    if (state === 'error' && path.endsWith('/patients/queue')) return error(500, 'INTERNAL_ERROR', 'Unable to load queue');
    if (state === 'forbidden' && path.endsWith('/prescriptions')) return error(403, 'FORBIDDEN', 'Insufficient permissions');
    if (path.endsWith('/patients/queue')) {
      const activeOnly = new URL(route.request().url()).searchParams.get('status') === 'in_consultation';
      const entries = state === 'empty' ? [] : [{
        _id: 'mock-queue',
        patientId: 'mock-patient',
        doctorId: 'mock-doctor',
        queueNumber: 1,
        status: activeOnly ? 'in_consultation' : 'waiting',
        createdAt: '2026-01-15T09:30:00.000Z',
        patient: { _id: 'mock-patient', name: 'Test Patient', age: 35, gender: 'other', assignedDoctorId: 'mock-doctor', totalVisits: 0, createdAt: '2026-01-15T09:30:00.000Z' },
      }];
      return json(route, 200, { success: true, data: entries, pagination: { total: entries.length, page: 1, limit: 10, totalPages: entries.length ? 1 : 0 } });
    }
    if (path.endsWith('/patients/mock-patient')) return ok({ patient: { _id: 'mock-patient', name: 'Test Patient', age: 35, gender: 'other', assignedDoctorId: 'mock-doctor', totalVisits: 1 }, visitHistory: [{ _id: 'mock-queue', patientId: 'mock-patient', doctorId: 'mock-doctor', queueDate: '2026-01-15', queueNumber: 1, status: 'completed', createdAt: '2026-01-15T09:30:00.000Z' }], visitPagination: { total: 1, page: 1, limit: 10, totalPages: 1 }, daysSinceLastVisit: 0 });
    if (path.endsWith('/patients/mock-patient/qr')) return ok({ qrCode: { imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=', contentType: 'image/png', format: 'png', containsPatientData: false } });
    if (path.endsWith('/patients/qr/rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr')) return ok({ patient: { _id: '000000000000000000000010' } });
    if (path.endsWith('/communications/patients/mock-patient/timeline')) return ok({
      adapter: { adapter: 'cloud', label: 'WhatsApp Cloud API' },
      messages: [
        { _id: 'message-reply', direction: 'inbound', purpose: 'patient_reply', status: 'replied', replyText: 'CONFIRM', timeline: [{ status: 'replied', at: '2026-01-15T10:05:00.000Z' }], createdAt: '2026-01-15T10:05:00.000Z' },
        { _id: 'message-outbound', direction: 'outbound', purpose: 'appointment_confirmation', status: 'delivered', timeline: [{ status: 'queued', at: '2026-01-15T10:00:00.000Z' }, { status: 'sent', at: '2026-01-15T10:00:02.000Z' }, { status: 'delivered', at: '2026-01-15T10:00:04.000Z' }], createdAt: '2026-01-15T10:00:00.000Z' },
      ],
    });
    if (path.endsWith('/communications/alerts')) return ok({ alerts: [{ _id: 'alert-1', type: 'patient_reply', summary: 'Patient replied CONFIRM', createdAt: '2026-01-15T10:05:00.000Z' }] });
    if (path.endsWith('/patients')) {
      const patients = state === 'empty' ? [] : [{ _id: 'mock-patient', name: 'Test Patient', maskedPhone: '+91******0001', age: 35, gender: 'other', assignedDoctorId: 'mock-doctor', totalVisits: 1, createdAt: '2026-01-15T09:30:00.000Z' }];
      return json(route, 200, { success: true, data: patients, pagination: { total: patients.length, page: 1, limit: 10, totalPages: patients.length ? 1 : 0 } });
    }
    if (path.endsWith('/prescriptions')) {
      if (route.request().method() === 'POST') return json(route, 201, { success: true, data: { prescription: { _id: 'mock-prescription', deliveryStatus: 'pending' } } });
      return ok([]);
    }
    if (path.endsWith('/analytics/operations')) return ok({
      filters: { from: '2026-01-10', to: '2026-01-12', doctorId: role === 'doctor' ? users.doctor._id : null, timeZone: 'Asia/Kolkata' },
      dailyPatientVolume: [{ date: '2026-01-10', count: 2 }, { date: '2026-01-11', count: 1 }, { date: '2026-01-12', count: 0 }],
      waitingTime: { sampleSize: 2, averageMinutes: 22.5, buckets: [{ key: 'under_15', label: 'Under 15 min', minMinutes: 0, maxMinutes: 14, count: 1, percentage: 50 }, { key: '15_to_29', label: '15–29 min', minMinutes: 15, maxMinutes: 29, count: 0, percentage: 0 }, { key: '30_to_59', label: '30–59 min', minMinutes: 30, maxMinutes: 59, count: 1, percentage: 50 }, { key: '60_plus', label: '60+ min', minMinutes: 60, maxMinutes: null, count: 0, percentage: 0 }] },
      queue: { total: 3, completed: 2, cancelled: 1, waiting: 0, inConsultation: 0, completionRate: 66.67, cancellationRate: 33.33 },
      doctorWorkload: [{ doctorId: users.doctor._id, doctorName: users.doctor.name, total: 3, completed: 2, cancelled: 1, averageWaitMinutes: 22.5 }],
      returningPatients: { returningVisits: 2, totalVisits: 3, rate: 66.67 },
      appointments: { completed: 1, noShows: 1, eligibleTotal: 2, noShowRate: 50 },
      messages: { delivery: { available: false, attempted: 0, deliveredOrRead: 0, rate: null }, replies: { available: false, requestsSent: 0, replied: 0, rate: null }, note: 'No tracked message records exist for this filter. No delivery or reply rate is inferred.' },
      feedback: { responses: 0, averageRating: null },
    });
    if (path.endsWith('/analytics/dropouts')) return ok([{ patientId: 'mock-patient', patientName: 'Test Patient', doctorId: users.doctor._id, followupDueDate: '2026-01-01', asOfDate: '2026-01-31', daysOverdue: 30, status: 'overdue_30', rule: 'Follow-up due date is 30 days overdue (30-day threshold).', lastOutreachAt: null, replied: false }]);
    if (path.endsWith('/feedback')) return json(route, 200, { success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } });
    if (path.endsWith('/auth/doctors')) return ok({ doctors: [users.doctor] });
    if (path.endsWith('/auth/staff')) return json(route, 200, { success: true, data: { staff: [users.doctor, users.receptionist] }, pagination: { total: 2, page: 1, limit: 10, totalPages: 1 } });
    if (/\/auth\/staff\/[^/]+\/(enable|disable|reset-password)$/.test(path)) return ok({ updated: true });
    if (path.endsWith('/clinic/me/audit')) return json(route, 200, { success: true, data: { events: [{ _id: 'audit-1', action: 'clinic.settings_updated', targetType: 'Clinic', metadata: { fields: ['branding'] }, actor: { _id: users.admin._id, name: users.admin.name, role: users.admin.role }, createdAt: '2026-01-15T09:30:00.000Z' }] }, pagination: { total: 1, page: 1, limit: 10, totalPages: 1 } });
    if (path.endsWith('/clinic/me')) return ok({ clinic: { name: 'Mock Clinic', email: 'clinic@example.test', address: '', city: '', state: '', phone: '', logoUrl: '', registrationNumber: '', maxPatientsPerHour: 4, workingHours: { start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' }, branding: { primaryColor: '#0f766e', accentColor: '#2563eb' }, passwordPolicy: { minLength: 12, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false }, aiConfig: { isConfigured: false }, whatsappConfig: { adapter: 'cloud', apiVersion: 'v26.0', isConfigured: true } } });
    return error(404, 'NOT_FOUND', 'Endpoint not found');
  });
}
