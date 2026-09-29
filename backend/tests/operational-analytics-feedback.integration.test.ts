import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('operational analytics, dropout radar, and patient feedback', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let PatientModel: typeof import('../src/modules/patients/patient.model.js').PatientModel;
  let AppointmentModel: typeof import('../src/modules/appointments/appointment.model.js').AppointmentModel;
  let VisitQueueModel: typeof import('../src/modules/patients/visit-queue.model.js').VisitQueueModel;
  let PrescriptionModel: typeof import('../src/modules/prescriptions/prescription.model.js').PrescriptionModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let bcrypt: typeof import('bcryptjs').default;
  let clinicId = '';
  let otherClinicId = '';
  let doctorId = '';
  let otherDoctorId = '';
  let patientId = '';
  let completedAppointmentId = '';
  let adminToken = '';
  let doctorToken = '';
  let receptionistToken = '';
  let otherAdminToken = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const range = { from: '2026-01-10', to: '2026-01-12' };

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'operational_analytics_feedback');
    ({ default: mongoose } = await import('mongoose'));
    ({ ClinicModel } = await import('../src/modules/clinics/clinic.model.js'));
    ({ UserModel } = await import('../src/modules/users/user.model.js'));
    ({ PatientModel } = await import('../src/modules/patients/patient.model.js'));
    ({ AppointmentModel } = await import('../src/modules/appointments/appointment.model.js'));
    ({ VisitQueueModel } = await import('../src/modules/patients/visit-queue.model.js'));
    ({ PrescriptionModel } = await import('../src/modules/prescriptions/prescription.model.js'));
    ({ AuthSessionModel } = await import('../src/modules/auth/auth-session.model.js'));
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ default: bcrypt } = await import('bcryptjs'));
    const { createApp } = await import('../src/app.js');
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      ClinicModel.syncIndexes(), UserModel.syncIndexes(), PatientModel.syncIndexes(),
      AppointmentModel.syncIndexes(), VisitQueueModel.syncIndexes(), PrescriptionModel.syncIndexes(), AuthSessionModel.syncIndexes(),
    ]);
    app = createApp();

    const [clinic, otherClinic] = await ClinicModel.create([
      { name: 'Analytics Clinic', email: 'analytics@example.test' },
      { name: 'Other Analytics Clinic', email: 'other-analytics@example.test' },
    ]);
    if (!clinic || !otherClinic) throw new Error('Expected clinics');
    clinicId = String(clinic._id);
    otherClinicId = String(otherClinic._id);
    const passwordHash = await bcrypt.hash('ValidPassword!123', 4);
    const [admin, doctor, receptionist, otherAdmin, otherDoctor] = await UserModel.create([
      { clinicId, name: 'Analytics Admin', email: 'analytics-admin@example.test', passwordHash, role: 'admin' },
      { clinicId, name: 'Dr Analytics', email: 'analytics-doctor@example.test', passwordHash, role: 'doctor' },
      { clinicId, name: 'Analytics Reception', email: 'analytics-reception@example.test', passwordHash, role: 'receptionist' },
      { clinicId: otherClinicId, name: 'Other Admin', email: 'other-admin@example.test', passwordHash, role: 'admin' },
      { clinicId: otherClinicId, name: 'Other Doctor', email: 'other-doctor@example.test', passwordHash, role: 'doctor' },
    ]);
    if (!admin || !doctor || !receptionist || !otherAdmin || !otherDoctor) throw new Error('Expected users');
    doctorId = String(doctor._id);
    otherDoctorId = String(otherDoctor._id);
    const issueToken = async (user: typeof admin) => {
      const sessionId = crypto.randomUUID();
      await AuthSessionModel.create({ userId: user._id, clinicId: user.clinicId, sessionId, refreshTokenHash: await bcrypt.hash(crypto.randomUUID(), 4), issuedAt: new Date(), lastActivityAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
      return signAccessToken({ userId: String(user._id), clinicId: String(user.clinicId), role: user.role, sessionVersion: user.sessionVersion, sessionId, mfaVerified: false });
    };
    [adminToken, doctorToken, receptionistToken, otherAdminToken] = await Promise.all([issueToken(admin), issueToken(doctor), issueToken(receptionist), issueToken(otherAdmin)]);

    const [patient, secondPatient, otherPatient] = await PatientModel.create([
      { clinicId, assignedDoctorId: doctor._id, registeredById: receptionist._id, name: 'Returning Patient', normalizedName: 'returning patient', phone: '+919111111111', age: 40, gender: 'female', followupDueDate: new Date('2026-01-01T00:00:00.000+05:30') },
      { clinicId, assignedDoctorId: doctor._id, registeredById: receptionist._id, name: 'New Patient', normalizedName: 'new patient', phone: '+919222222222', age: 31, gender: 'male', followupDueDate: new Date('2026-01-28T00:00:00.000+05:30') },
      { clinicId: otherClinicId, assignedDoctorId: otherDoctor._id, registeredById: otherAdmin._id, name: 'Foreign Patient', normalizedName: 'foreign patient', phone: '+919333333333', age: 50, gender: 'other', followupDueDate: new Date('2025-01-01T00:00:00.000+05:30') },
    ]);
    if (!patient || !secondPatient || !otherPatient) throw new Error('Expected patients');
    patientId = String(patient._id);

    const queues = await VisitQueueModel.create([
      { clinicId, patientId: patient._id, doctorId: doctor._id, checkedInById: receptionist._id, queueDate: '2026-01-05', queueNumber: 1, status: 'completed', checkedInAt: new Date('2026-01-05T03:30:00.000Z'), consultationStartedAt: new Date('2026-01-05T03:40:00.000Z'), completedAt: new Date('2026-01-05T04:00:00.000Z') },
      { clinicId, patientId: patient._id, doctorId: doctor._id, checkedInById: receptionist._id, queueDate: '2026-01-10', queueNumber: 1, status: 'completed', checkedInAt: new Date('2026-01-10T03:30:00.000Z'), consultationStartedAt: new Date('2026-01-10T03:40:00.000Z'), completedAt: new Date('2026-01-10T04:00:00.000Z') },
      { clinicId, patientId: secondPatient._id, doctorId: doctor._id, checkedInById: receptionist._id, queueDate: '2026-01-10', queueNumber: 2, status: 'completed', checkedInAt: new Date('2026-01-10T04:00:00.000Z'), consultationStartedAt: new Date('2026-01-10T04:35:00.000Z'), completedAt: new Date('2026-01-10T05:00:00.000Z') },
      { clinicId, patientId: patient._id, doctorId: doctor._id, checkedInById: receptionist._id, queueDate: '2026-01-11', queueNumber: 1, status: 'cancelled', checkedInAt: new Date('2026-01-11T03:30:00.000Z'), cancelledAt: new Date('2026-01-11T03:35:00.000Z') },
      { clinicId: otherClinicId, patientId: otherPatient._id, doctorId: otherDoctor._id, checkedInById: otherAdmin._id, queueDate: '2026-01-10', queueNumber: 1, status: 'completed', checkedInAt: new Date('2026-01-10T03:30:00.000Z'), consultationStartedAt: new Date('2026-01-10T05:00:00.000Z'), completedAt: new Date('2026-01-10T05:30:00.000Z') },
    ]);
    const [completedAppointment] = await AppointmentModel.create([
      { clinicId, patientId: patient._id, doctorId: doctor._id, scheduledAt: new Date('2026-01-10T04:30:00.000Z'), status: 'completed' },
      { clinicId, patientId: secondPatient._id, doctorId: doctor._id, scheduledAt: new Date('2026-01-11T04:30:00.000Z'), status: 'no_show' },
      { clinicId, patientId: patient._id, doctorId: doctor._id, scheduledAt: new Date('2026-01-12T04:30:00.000Z'), status: 'cancelled' },
      { clinicId: otherClinicId, patientId: otherPatient._id, doctorId: otherDoctor._id, scheduledAt: new Date('2026-01-10T04:30:00.000Z'), status: 'no_show' },
    ]);
    if (!completedAppointment) throw new Error('Expected completed appointment');
    completedAppointmentId = String(completedAppointment._id);

    await PrescriptionModel.create([
      { clinicId, patientId: patient._id, doctorId: doctor._id, queueEntryId: queues[1]!._id, visitDate: new Date('2026-01-10T04:00:00.000Z'), diagnosis: 'Fixture diagnosis', medicines: [{ name: 'Fixture', dosage: '1', frequency: 'Once', duration: '1 day' }], clinicianConfirmedAt: new Date('2026-01-10T04:00:00.000Z'), deliveryStatus: 'delivered' },
      { clinicId, patientId: secondPatient._id, doctorId: doctor._id, queueEntryId: queues[2]!._id, visitDate: new Date('2026-01-10T05:00:00.000Z'), diagnosis: 'Fixture diagnosis', medicines: [{ name: 'Fixture', dosage: '1', frequency: 'Once', duration: '1 day' }], clinicianConfirmedAt: new Date('2026-01-10T05:00:00.000Z'), deliveryStatus: 'failed' },
    ]);
    await mongoose.connection.collection('appointments').updateMany(
      { clinicId: clinic._id, _id: { $in: [completedAppointment._id, (await AppointmentModel.findOne({ clinicId, status: 'no_show' }).lean())!._id] } },
      { $set: { confirmationMessageId: 'tracked-message', confirmationDeliveryStatus: 'delivered' } },
    );
    await mongoose.connection.collection('appointments').updateOne({ _id: completedAppointment._id }, { $set: { patientRepliedAt: new Date('2026-01-10T03:00:00.000Z') } });
  }, 30_000);

  afterAll(async () => {
    if (mongoose?.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
  }, 30_000);

  it('calculates operational metrics from clinic records with inclusive clinic-local dates', async () => {
    const response = await request(app).get('/api/v1/analytics/operations').set(bearer(adminToken)).query(range);
    expect(response.status).toBe(200);
    expect(response.body.data.dailyPatientVolume).toEqual([
      { date: '2026-01-10', count: 2 },
      { date: '2026-01-11', count: 1 },
      { date: '2026-01-12', count: 0 },
    ]);
    expect(response.body.data.waitingTime).toMatchObject({ sampleSize: 2, averageMinutes: 22.5 });
    expect(response.body.data.waitingTime.buckets.map((bucket: { count: number }) => bucket.count)).toEqual([1, 0, 1, 0]);
    expect(response.body.data.queue).toMatchObject({ total: 3, completed: 2, cancelled: 1, completionRate: 66.67, cancellationRate: 33.33 });
    expect(response.body.data.returningPatients).toEqual({ returningVisits: 2, totalVisits: 3, rate: 66.67 });
    expect(response.body.data.appointments).toEqual({ completed: 1, noShows: 1, eligibleTotal: 2, noShowRate: 50 });
    expect(response.body.data.messages.delivery).toMatchObject({ available: true, attempted: 4, deliveredOrRead: 3, rate: 75 });
    expect(response.body.data.messages.replies).toMatchObject({ available: true, requestsSent: 2, replied: 1, rate: 50 });
    expect(response.body.data.doctorWorkload).toContainEqual(expect.objectContaining({ doctorId, doctorName: 'Dr Analytics', total: 3, completed: 2, cancelled: 1, averageWaitMinutes: 22.5 }));
  });

  it('enforces role and clinic isolation for analytics and doctor filters', async () => {
    expect((await request(app).get('/api/v1/analytics/operations').set(bearer(receptionistToken)).query(range)).status).toBe(403);
    expect((await request(app).get('/api/v1/analytics/operations').set(bearer(doctorToken)).query({ ...range, doctorId: otherDoctorId })).status).toBe(404);
    const other = await request(app).get('/api/v1/analytics/operations').set(bearer(otherAdminToken)).query(range);
    expect(other.status).toBe(200);
    expect(other.body.data.queue.total).toBe(1);
    expect(other.body.data.dailyPatientVolume[0].count).toBe(1);
  });

  it('returns a stable zero-state for an empty date range', async () => {
    const response = await request(app).get('/api/v1/analytics/operations').set(bearer(adminToken)).query({ from: '2026-02-01', to: '2026-02-01' });
    expect(response.status).toBe(200);
    expect(response.body.data.dailyPatientVolume).toEqual([{ date: '2026-02-01', count: 0 }]);
    expect(response.body.data.waitingTime).toMatchObject({ sampleSize: 0, averageMinutes: null });
    expect(response.body.data.returningPatients.rate).toBeNull();
    expect(response.body.data.appointments.noShowRate).toBeNull();
    expect(response.body.data.messages.delivery).toMatchObject({ available: false, attempted: 0, rate: null });
    expect((await request(app).get('/api/v1/analytics/operations').set(bearer(adminToken)).query({ from: '2026-02-02', to: '2026-02-01' })).status).toBe(400);
    expect((await request(app).get('/api/v1/analytics/operations').set(bearer(adminToken)).query({ from: '2025-01-01', to: '2026-02-01' })).status).toBe(400);
  });

  it('exports authorized aggregate-only CSV without patient or feedback content', async () => {
    const response = await request(app).get('/api/v1/analytics/operations.csv').set(bearer(adminToken)).query(range);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['cache-control']).toContain('private');
    expect(response.text).toContain('metric,segment,value');
    expect(response.text).toContain('daily_patient_volume,2026-01-10,2');
    expect(response.text).not.toContain('Returning Patient');
    expect(response.text).not.toContain('+919111111111');
    expect((await request(app).get('/api/v1/analytics/operations.csv').set(bearer(receptionistToken)).query(range)).status).toBe(403);
  });

  it('flags only rule-matching dropouts and explains every flag', async () => {
    const response = await request(app).get('/api/v1/analytics/dropouts').set(bearer(doctorToken)).query({ asOf: '2026-01-31' });
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ patientId, patientName: 'Returning Patient', followupDueDate: '2026-01-01', asOfDate: '2026-01-31', daysOverdue: 30, status: 'overdue_30', rule: 'Follow-up due date is 30 days overdue (30-day threshold).' });
    expect(response.body.data[0]).not.toHaveProperty('diagnosis');
  });

  it('lets authorized clinicians set follow-up dates while preserving tenant isolation', async () => {
    const update = await request(app).patch(`/api/v1/patients/${patientId}/follow-up`).set(bearer(doctorToken)).send({ followupDueDate: '2026-03-01' });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({ patientId, followupDueDate: '2026-03-01' });
    expect((await request(app).patch(`/api/v1/patients/${patientId}/follow-up`).set(bearer(receptionistToken)).send({ followupDueDate: '2026-03-02' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/patients/${patientId}/follow-up`).set(bearer(otherAdminToken)).send({ followupDueDate: '2026-03-02' })).status).toBe(404);
  });

  it('requires explicit consent, validates abuse-prone comments, and keeps feedback clinic-private', async () => {
    const issued = await request(app).post('/api/v1/feedback/requests').set(bearer(adminToken)).send({ appointmentId: completedAppointmentId });
    expect(issued.status).toBe(201);
    expect(issued.body.data.submissionUrl).toMatch(/\/feedback\/[A-Za-z0-9_-]+$/);
    const token = issued.body.data.submissionUrl.split('/').at(-1);
    expect((await request(app).post(`/api/v1/feedback/submit/${token}`).send({ consent: false, rating: 5 })).status).toBe(400);
    expect((await request(app).post(`/api/v1/feedback/submit/${token}`).send({ consent: true, rating: 4, comment: 'bad\u0000comment' })).status).toBe(400);
    const submitted = await request(app).post(`/api/v1/feedback/submit/${token}`).send({ consent: true, rating: 4, comment: 'Kind staff and a clear process.' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data).toEqual({ accepted: true });
    expect((await request(app).post(`/api/v1/feedback/submit/${token}`).send({ consent: true, rating: 5 })).status).toBe(409);
    const submittedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const privateList = await request(app).get('/api/v1/feedback').set(bearer(doctorToken)).query({ from: submittedDate, to: submittedDate });
    expect(privateList.status).toBe(200);
    expect(privateList.body.data[0]).toMatchObject({ rating: 4, comment: 'Kind staff and a clear process.', visibility: 'clinic_private' });
    expect((await request(app).get('/api/v1/feedback').set(bearer(receptionistToken)).query({ from: submittedDate, to: submittedDate })).status).toBe(403);
    expect((await request(app).post('/api/v1/feedback/requests').set(bearer(otherAdminToken)).send({ appointmentId: completedAppointmentId })).status).toBe(404);
  });
});
