import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('clinic-scoped appointment scheduling', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let PatientModel: typeof import('../src/modules/patients/patient.model.js').PatientModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let bcrypt: typeof import('bcryptjs').default;
  let clinicId = '';
  let doctorId = '';
  let patientId = '';
  let receptionistToken = '';
  let doctorToken = '';
  let otherReceptionistToken = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const body = (overrides: Record<string, unknown> = {}) => ({
    patientId,
    doctorId,
    scheduledAt: '2030-08-05T04:30:00.000Z',
    durationMinutes: 15,
    ...overrides,
  });

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'appointments');
    ({ default: mongoose } = await import('mongoose'));
    ({ ClinicModel } = await import('../src/modules/clinics/clinic.model.js'));
    ({ UserModel } = await import('../src/modules/users/user.model.js'));
    ({ PatientModel } = await import('../src/modules/patients/patient.model.js'));
    ({ AuthSessionModel } = await import('../src/modules/auth/auth-session.model.js'));
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ default: bcrypt } = await import('bcryptjs'));
    const { createApp } = await import('../src/app.js');
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all([ClinicModel.syncIndexes(), UserModel.syncIndexes(), PatientModel.syncIndexes(), AuthSessionModel.syncIndexes()]);
    app = createApp();

    const [clinic, otherClinic] = await ClinicModel.create([
      { name: 'Appointment Clinic', email: 'appointments@example.test', workingHours: { start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' }, maxPatientsPerHour: 4 },
      { name: 'Other Appointment Clinic', email: 'other-appointments@example.test' },
    ]);
    if (!clinic || !otherClinic) throw new Error('Expected clinics');
    clinicId = String(clinic._id);
    const passwordHash = await bcrypt.hash('ValidPassword!123', 4);
    const [doctor, receptionist, otherReceptionist] = await UserModel.create([
      { clinicId: clinic._id, name: 'Doctor', email: 'appointment-doctor@example.test', passwordHash, role: 'doctor' },
      { clinicId: clinic._id, name: 'Receptionist', email: 'appointment-reception@example.test', passwordHash, role: 'receptionist' },
      { clinicId: otherClinic._id, name: 'Other Receptionist', email: 'other-appointment-reception@example.test', passwordHash, role: 'receptionist' },
    ]);
    if (!doctor || !receptionist || !otherReceptionist) throw new Error('Expected users');
    doctorId = String(doctor._id);
    const patient = await PatientModel.create({ clinicId, assignedDoctorId: doctor._id, registeredById: receptionist._id, name: 'Priya Mehta', normalizedName: 'priya mehta', phone: '+919876543210', age: 34, gender: 'female' });
    patientId = String(patient._id);
    const issueToken = async (user: typeof doctor) => {
      const sessionId = crypto.randomUUID();
      await AuthSessionModel.create({ userId: user._id, clinicId: user.clinicId, sessionId, refreshTokenHash: await bcrypt.hash(crypto.randomUUID(), 4), issuedAt: new Date(), lastActivityAt: new Date(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
      return signAccessToken({ userId: String(user._id), clinicId: String(user.clinicId), role: user.role, sessionVersion: user.sessionVersion, sessionId, mfaVerified: false });
    };
    receptionistToken = await issueToken(receptionist);
    doctorToken = await issueToken(doctor);
    otherReceptionistToken = await issueToken(otherReceptionist);
  }, 30_000);

  afterAll(async () => {
    if (mongoose?.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
  }, 30_000);

  it('creates a clinic-owned appointment and updates the patient next appointment', async () => {
    const response = await request(app).post('/api/v1/appointments').set(bearer(receptionistToken)).send(body());
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ patientId, doctorId, status: 'pending', durationMinutes: 15 });
    const patient = await PatientModel.findById(patientId).lean();
    expect(String(patient?.nextAppointmentId)).toBe(response.body.data._id);
  });

  it('prevents double booking and scheduling outside clinic hours', async () => {
    const duplicate = await request(app).post('/api/v1/appointments').set(bearer(doctorToken)).send(body());
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DOUBLE_BOOKING');
    const outsideHours = await request(app).post('/api/v1/appointments').set(bearer(receptionistToken)).send(body({ scheduledAt: '2030-08-05T02:30:00.000Z' }));
    expect(outsideHours.status).toBe(400);
  });

  it('enforces clinic isolation for appointment creation and board reads', async () => {
    const create = await request(app).post('/api/v1/appointments').set(bearer(otherReceptionistToken)).send(body({ scheduledAt: '2030-08-05T05:00:00.000Z' }));
    expect(create.status).toBe(404);
    const board = await request(app).get('/api/v1/appointments/board').set(bearer(otherReceptionistToken)).query({ date: '2030-08-05', doctorId });
    expect(board.status).toBe(404);
  });
});
