import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('patient search, repeat visit, history, and numbered queue', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let AuditLogModel: typeof import('../src/modules/audit/audit-log.model.js').AuditLogModel;
  let PatientModel: typeof import('../src/modules/patients/patient.model.js').PatientModel;
  let VisitQueueModel: typeof import('../src/modules/patients/visit-queue.model.js').VisitQueueModel;
  let QueueCounterModel: typeof import('../src/modules/patients/visit-queue.model.js').QueueCounterModel;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let normalizePatientName: typeof import('../src/modules/patients/patient.service.js').normalizePatientName;
  let bcrypt: typeof import('bcryptjs').default;

  let clinicId = '';
  let otherClinicId = '';
  let adminToken = '';
  let adminWithoutMfaToken = '';
  let receptionistToken = '';
  let doctorToken = '';
  let secondDoctorToken = '';
  let otherAdminToken = '';
  let doctorId = '';
  let secondDoctorId = '';
  let otherDoctorId = '';
  let returningPatientId = '';
  let returningQueueEntryId = '';
  let firstPatientId = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const newPatientBody = (overrides: Record<string, unknown> = {}) => ({
    name: 'Priya Mehta',
    phone: '+919876543210',
    age: 34,
    gender: 'female',
    bloodGroup: 'B+',
    chiefComplaint: 'Persistent fever for three days',
    assignedDoctorId: doctorId,
    ...overrides,
  });

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'patient_workflow');
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-sixty-four-characters-long-for-validation';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-sixty-four-characters-long-for-validation';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.CLIENT_URL = 'http://localhost:5173';
    process.env.CORS_ORIGINS = 'http://localhost:5173';
    process.env.COOKIE_SECURE = 'false';
    process.env.PLATFORM_SUPPORT_KEY = 'test-platform-support-key-that-is-long-enough';

    ({ default: mongoose } = await import('mongoose'));
    ({ ClinicModel } = await import('../src/modules/clinics/clinic.model.js'));
    ({ UserModel } = await import('../src/modules/users/user.model.js'));
    ({ AuthSessionModel } = await import('../src/modules/auth/auth-session.model.js'));
    ({ AuditLogModel } = await import('../src/modules/audit/audit-log.model.js'));
    ({ PatientModel } = await import('../src/modules/patients/patient.model.js'));
    ({ VisitQueueModel, QueueCounterModel } = await import('../src/modules/patients/visit-queue.model.js'));
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ normalizePatientName } = await import('../src/modules/patients/patient.service.js'));
    ({ default: bcrypt } = await import('bcryptjs'));
    const { createApp } = await import('../src/app.js');

    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      ClinicModel.syncIndexes(),
      UserModel.syncIndexes(),
      AuthSessionModel.syncIndexes(),
      AuditLogModel.syncIndexes(),
      PatientModel.syncIndexes(),
      VisitQueueModel.syncIndexes(),
      QueueCounterModel.syncIndexes(),
    ]);
    app = createApp();

    const clinics = await ClinicModel.create([
      { name: 'Patient Workflow Clinic', email: 'patient-workflow@example.test' },
      { name: 'Other Patient Clinic', email: 'other-patient-workflow@example.test' },
    ]);
    const clinic = clinics[0];
    const otherClinic = clinics[1];
    if (!clinic || !otherClinic) throw new Error('Expected clinic fixtures');
    clinicId = String(clinic._id);
    otherClinicId = String(otherClinic._id);

    const passwordHash = await bcrypt.hash('ValidPassword!123', 12);
    const users = await UserModel.create([
      { clinicId: clinic._id, name: 'Clinic Admin', email: 'patient-admin@example.test', passwordHash, role: 'admin', mfaRequired: true, mfaEnrolled: true },
      { clinicId: clinic._id, name: 'Receptionist', email: 'patient-reception@example.test', passwordHash, role: 'receptionist' },
      { clinicId: clinic._id, name: 'Doctor One', email: 'patient-doctor@example.test', passwordHash, role: 'doctor' },
      { clinicId: clinic._id, name: 'Doctor Two', email: 'patient-doctor-two@example.test', passwordHash, role: 'doctor' },
      { clinicId: otherClinic._id, name: 'Other Admin', email: 'other-patient-admin@example.test', passwordHash, role: 'admin', mfaRequired: true, mfaEnrolled: true },
      { clinicId: otherClinic._id, name: 'Other Doctor', email: 'other-patient-doctor@example.test', passwordHash, role: 'doctor' },
    ]);
    const [admin, receptionist, doctor, secondDoctor, otherAdmin, otherDoctor] = users;
    if (!admin || !receptionist || !doctor || !secondDoctor || !otherAdmin || !otherDoctor) throw new Error('Expected user fixtures');
    doctorId = String(doctor._id);
    secondDoctorId = String(secondDoctor._id);
    otherDoctorId = String(otherDoctor._id);

    const issueToken = async (user: typeof admin, mfaVerified: boolean) => {
      const sessionId = crypto.randomUUID();
      await AuthSessionModel.create({
        userId: user._id,
        clinicId: user.clinicId,
        sessionId,
        refreshTokenHash: await bcrypt.hash(crypto.randomUUID(), 4),
        issuedAt: new Date(),
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ...(mfaVerified ? { mfaVerifiedAt: new Date() } : {}),
      });
      return signAccessToken({
        userId: String(user._id),
        clinicId: String(user.clinicId),
        role: user.role,
        sessionVersion: user.sessionVersion,
        sessionId,
        mfaVerified,
      });
    };

    adminToken = await issueToken(admin, true);
    adminWithoutMfaToken = await issueToken(admin, false);
    receptionistToken = await issueToken(receptionist, false);
    doctorToken = await issueToken(doctor, false);
    secondDoctorToken = await issueToken(secondDoctor, false);
    otherAdminToken = await issueToken(otherAdmin, true);

    const returningPatient = await PatientModel.create({
      clinicId,
      assignedDoctorId: doctorId,
      registeredById: receptionist._id,
      name: 'Anita Deshmukh',
      normalizedName: normalizePatientName('Anita Deshmukh'),
      phone: '+919900001111',
      age: 52,
      gender: 'female',
      chiefComplaint: 'Historical complaint visible only to clinicians',
      totalVisits: 1,
      lastVisitDate: new Date('2026-07-01T09:00:00.000Z'),
    });
    returningPatientId = String(returningPatient._id);
    await VisitQueueModel.create({
      clinicId,
      patientId: returningPatient._id,
      doctorId,
      checkedInById: receptionist._id,
      queueDate: '2026-07-01',
      queueNumber: 8,
      status: 'completed',
      checkedInAt: new Date('2026-07-01T08:30:00.000Z'),
      completedAt: new Date('2026-07-01T09:00:00.000Z'),
    });
  }, 30_000);

  afterAll(async () => {
    if (mongoose?.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }, 30_000);

  it('rejects unauthenticated patient, queue, and history access', async () => {
    const responses = await Promise.all([
      request(app).post('/api/v1/patients').send(newPatientBody()),
      request(app).get('/api/v1/patients').query({ search: 'Priya Mehta' }),
      request(app).get('/api/v1/patients/queue'),
      request(app).get(`/api/v1/patients/${returningPatientId}`),
      request(app).post(`/api/v1/patients/${returningPatientId}/check-ins`).send({}),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('validates new-patient input and accepts password-only admins', async () => {
    const invalid = await request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send({ name: 'A', phone: '98765', age: 0, gender: 'unknown' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    const unverified = await request(app).get('/api/v1/patients').set(bearer(adminWithoutMfaToken));
    expect(unverified.status).toBe(200);
    expect(await PatientModel.countDocuments({ clinicId, name: 'A' })).toBe(0);
  });

  it('blocks assigning a patient to a doctor from another clinic', async () => {
    const response = await request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send(newPatientBody({ assignedDoctorId: otherDoctorId }));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('registers a new patient and immediately assigns queue number one', async () => {
    const response = await request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send(newPatientBody());
    expect(response.status).toBe(201);
    expect(response.body.data.patient).toMatchObject({ name: 'Priya Mehta', phone: '+919876543210', assignedDoctorId: doctorId, totalVisits: 0 });
    expect(response.body.data.patient).not.toHaveProperty('normalizedName');
    expect(response.body.data.patient).not.toHaveProperty('qrTokenHash');
    expect(response.body.data.patient).not.toHaveProperty('qrTokenEncrypted');
    expect(response.body.data.queueEntry).toMatchObject({ doctorId, queueNumber: 1, status: 'waiting' });
    expect(response.body.data.qrCode).toMatchObject({ contentType: 'image/png', format: 'png', containsPatientData: false });
    expect(response.body.data.qrCode.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    firstPatientId = response.body.data.patient._id;
    expect(await AuditLogModel.countDocuments({ clinicId, action: 'patient.created', targetId: firstPatientId })).toBe(1);
  });

  it('rejects duplicate phone numbers without creating another patient', async () => {
    const before = await PatientModel.countDocuments({ clinicId, isDeleted: false });
    const response = await request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send(newPatientBody({ name: 'Different Name' }));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
    expect(await PatientModel.countDocuments({ clinicId, isDeleted: false })).toBe(before);
  });

  it('uses exact normalized full-name search and safely distinguishes duplicate names', async () => {
    const second = await request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send(newPatientBody({ phone: '+919876543211' }));
    expect(second.status).toBe(201);
    expect(second.body.data.queueEntry.queueNumber).toBe(2);

    const exact = await request(app).get('/api/v1/patients').set(bearer(receptionistToken)).query({ search: '  PRIYA   MEHTA  ' });
    expect(exact.status).toBe(200);
    expect(exact.body.data).toHaveLength(2);
    expect(exact.body.data.every((patient: Record<string, unknown>) => patient.name === 'Priya Mehta')).toBe(true);
    expect(exact.body.data.every((patient: Record<string, unknown>) => 'maskedPhone' in patient && !('phone' in patient) && !('chiefComplaint' in patient))).toBe(true);
    expect(exact.body.data[0].maskedPhone).toMatch(/^\+91\*+\d{4}$/);

    const prefix = await request(app).get('/api/v1/patients').set(bearer(receptionistToken)).query({ search: 'Pri', match: 'prefix' });
    expect(prefix.status).toBe(200);
    expect(prefix.body.data).toHaveLength(2);

    const noImplicitPrefix = await request(app).get('/api/v1/patients').set(bearer(receptionistToken)).query({ search: 'Pri' });
    expect(noImplicitPrefix.body.data).toHaveLength(0);
    const otherClinicSearch = await request(app).get('/api/v1/patients').set(bearer(otherAdminToken)).query({ search: 'Priya Mehta' });
    expect(otherClinicSearch.status).toBe(200);
    expect(otherClinicSearch.body.data).toHaveLength(0);
    const audit = await AuditLogModel.findOne({ clinicId, action: 'patient.search_performed' }).sort({ createdAt: -1 }).lean();
    expect(JSON.stringify(audit?.metadata)).not.toContain('Priya');
  });

  it('checks in a returning patient from only the selected patient ID', async () => {
    const search = await request(app).get('/api/v1/patients').set(bearer(receptionistToken)).query({ search: 'Anita Deshmukh' });
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0]).toMatchObject({ _id: returningPatientId, name: 'Anita Deshmukh', totalVisits: 1 });

    const before = await PatientModel.findById(returningPatientId).lean();
    const checkedIn = await request(app).post(`/api/v1/patients/${returningPatientId}/check-ins`).set(bearer(receptionistToken)).send({});
    expect(checkedIn.status).toBe(201);
    expect(checkedIn.body.data.patient).toMatchObject({ _id: returningPatientId, name: 'Anita Deshmukh' });
    expect(checkedIn.body.data.queueEntry).toMatchObject({ doctorId, queueNumber: 3, status: 'waiting' });
    returningQueueEntryId = checkedIn.body.data.queueEntry._id;
    const after = await PatientModel.findById(returningPatientId).lean();
    expect(after?.name).toBe(before?.name);
    expect(after?.phone).toBe(before?.phone);
    expect(await PatientModel.countDocuments({ clinicId, normalizedName: normalizePatientName('Anita Deshmukh'), isDeleted: false })).toBe(1);
    expect(await AuditLogModel.countDocuments({ clinicId, action: 'patient.checked_in', targetId: returningPatientId })).toBe(1);
  });

  it('prevents duplicate same-day check-in and rejects unknown body fields', async () => {
    const duplicate = await request(app).post(`/api/v1/patients/${returningPatientId}/check-ins`).set(bearer(receptionistToken)).send({});
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ALREADY_CHECKED_IN');
    const unknown = await request(app).post(`/api/v1/patients/${firstPatientId}/check-ins`).set(bearer(receptionistToken)).send({ chiefComplaint: 'Should not be re-entered' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
    const malformed = await request(app).post('/api/v1/patients/not-an-object-id/check-ins').set(bearer(receptionistToken)).send({});
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('shows only a doctor’s own numbered queue and protects cross-doctor access', async () => {
    const queue = await request(app).get('/api/v1/patients/queue').set(bearer(doctorToken));
    expect(queue.status).toBe(200);
    expect(queue.body.data.map((entry: { queueNumber: number }) => entry.queueNumber)).toEqual([1, 2, 3]);
    expect(queue.body.data.every((entry: { doctorId: string }) => entry.doctorId === doctorId)).toBe(true);
    expect(queue.body.data.every((entry: Record<string, unknown>) => 'patient' in entry)).toBe(true);

    const forbidden = await request(app).get('/api/v1/patients/queue').set(bearer(doctorToken)).query({ doctorId: secondDoctorId });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    const otherDoctorQueue = await request(app).get('/api/v1/patients/queue').set(bearer(secondDoctorToken));
    expect(otherDoctorQueue.status).toBe(200);
    expect(otherDoctorQueue.body.data).toHaveLength(0);
  });

  it('paginates the daily queue without changing its doctor-specific number order', async () => {
    const firstPage = await request(app).get('/api/v1/patients/queue').set(bearer(doctorToken)).query({ page: 1, limit: 2 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.map((entry: { queueNumber: number }) => entry.queueNumber)).toEqual([1, 2]);
    expect(firstPage.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const secondPage = await request(app).get('/api/v1/patients/queue').set(bearer(doctorToken)).query({ page: 2, limit: 2 });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.map((entry: { queueNumber: number }) => entry.queueNumber)).toEqual([3]);
    expect(secondPage.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('returns clinic-scoped visit history with receptionist clinical redaction', async () => {
    const receptionist = await request(app).get(`/api/v1/patients/${returningPatientId}`).set(bearer(receptionistToken));
    expect(receptionist.status).toBe(200);
    expect(receptionist.body.data.patient).not.toHaveProperty('chiefComplaint');
    expect(receptionist.body.data.visitHistory).toHaveLength(2);
    const doctor = await request(app).get(`/api/v1/patients/${returningPatientId}`).set(bearer(doctorToken));
    expect(doctor.status).toBe(200);
    expect(doctor.body.data.patient.chiefComplaint).toBe('Historical complaint visible only to clinicians');
    const crossClinic = await request(app).get(`/api/v1/patients/${returningPatientId}`).set(bearer(otherAdminToken));
    expect(crossClinic.status).toBe(404);
    expect(crossClinic.body.error.code).toBe('NOT_FOUND');
  });

  it('paginates visit history and rejects unknown history query fields', async () => {
    const firstPage = await request(app).get(`/api/v1/patients/${returningPatientId}`).set(bearer(doctorToken)).query({ page: 1, limit: 1 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.visitHistory).toHaveLength(1);
    expect(firstPage.body.data.visitPagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });

    const secondPage = await request(app).get(`/api/v1/patients/${returningPatientId}`).set(bearer(doctorToken)).query({ page: 2, limit: 1 });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.visitHistory).toHaveLength(1);
    expect(secondPage.body.data.visitPagination).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });

    const unknown = await request(app).get(`/api/v1/patients/${returningPatientId}`).set(bearer(doctorToken)).query({ includeSecrets: 'true' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('blocks a new check-in while the patient has an active entry from an earlier clinic day', async () => {
    const patient = await PatientModel.create({
      clinicId,
      assignedDoctorId: doctorId,
      registeredById: new mongoose.Types.ObjectId(),
      name: 'Active Previous Day',
      normalizedName: normalizePatientName('Active Previous Day'),
      phone: '+919876543230',
      age: 45,
      gender: 'other',
      chiefComplaint: 'Existing active visit',
    });
    const previousEntry = await VisitQueueModel.create({
      clinicId,
      patientId: patient._id,
      doctorId,
      checkedInById: new mongoose.Types.ObjectId(),
      queueDate: '2000-01-01',
      queueNumber: 99,
      status: 'in_consultation',
      checkedInAt: new Date('2000-01-01T09:00:00.000Z'),
    });

    const response = await request(app).post(`/api/v1/patients/${patient._id}/check-ins`).set(bearer(receptionistToken)).send({});
    const activeEntries = await VisitQueueModel.find({ clinicId, patientId: patient._id, status: { $in: ['waiting', 'in_consultation'] } }).lean();
    if (response.status === 201) await VisitQueueModel.deleteOne({ _id: response.body.data.queueEntry._id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ALREADY_CHECKED_IN');
    expect(activeEntries).toHaveLength(1);
    expect(String(activeEntries[0]?._id)).toBe(String(previousEntry._id));
  });

  it('enforces queue transitions and counts a completed visit exactly once', async () => {
    const receptionistDenied = await request(app).patch(`/api/v1/patients/queue/${returningQueueEntryId}/status`).set(bearer(receptionistToken)).send({ status: 'in_consultation' });
    expect(receptionistDenied.status).toBe(403);
    const otherDoctorDenied = await request(app).patch(`/api/v1/patients/queue/${returningQueueEntryId}/status`).set(bearer(secondDoctorToken)).send({ status: 'in_consultation' });
    expect(otherDoctorDenied.status).toBe(404);

    const started = await request(app).patch(`/api/v1/patients/queue/${returningQueueEntryId}/status`).set(bearer(doctorToken)).send({ status: 'in_consultation' });
    expect(started.status).toBe(200);
    expect(started.body.data.queueEntry.status).toBe('in_consultation');
    const completed = await request(app).patch(`/api/v1/patients/queue/${returningQueueEntryId}/status`).set(bearer(doctorToken)).send({ status: 'completed' });
    expect(completed.status).toBe(200);
    expect((await PatientModel.findById(returningPatientId).lean())?.totalVisits).toBe(2);
    const repeated = await request(app).patch(`/api/v1/patients/queue/${returningQueueEntryId}/status`).set(bearer(doctorToken)).send({ status: 'completed' });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    expect((await PatientModel.findById(returningPatientId).lean())?.totalVisits).toBe(2);
  });

  it('allocates unique consecutive queue numbers during concurrent registrations', async () => {
    const responses = await Promise.all([
      request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send(newPatientBody({ name: 'Concurrent Patient One', phone: '+919876543220' })),
      request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send(newPatientBody({ name: 'Concurrent Patient Two', phone: '+919876543221' })),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const numbers = responses.map((response) => response.body.data.queueEntry.queueNumber).sort((left: number, right: number) => left - right);
    expect(numbers).toEqual([4, 5]);
    expect(new Set(numbers).size).toBe(2);
  });

  it('soft-deletes only within the admin clinic and releases the phone for re-registration', async () => {
    const doctorDenied = await request(app).delete(`/api/v1/patients/${firstPatientId}`).set(bearer(doctorToken));
    expect(doctorDenied.status).toBe(403);
    expect(doctorDenied.body.error.code).toBe('FORBIDDEN');
    const crossClinic = await request(app).delete(`/api/v1/patients/${firstPatientId}`).set(bearer(otherAdminToken));
    expect(crossClinic.status).toBe(404);

    const deleted = await request(app).delete(`/api/v1/patients/${firstPatientId}`).set(bearer(adminToken));
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deleted).toBe(true);
    expect((await PatientModel.findById(firstPatientId).lean())?.isDeleted).toBe(true);
    const search = await request(app).get('/api/v1/patients').set(bearer(receptionistToken)).query({ search: 'Priya Mehta' });
    expect(search.body.data.some((patient: { _id: string }) => patient._id === firstPatientId)).toBe(false);

    const replacement = await request(app).post('/api/v1/patients').set(bearer(receptionistToken)).send(newPatientBody({ name: 'Priya Mehta Re-registered' }));
    expect(replacement.status).toBe(201);
    expect(replacement.body.data.patient.phone).toBe('+919876543210');
    expect(await AuditLogModel.countDocuments({ clinicId, action: 'patient.deleted', targetId: firstPatientId })).toBe(1);
  });

  it('declares tenant, exact-name, queue-order, and duplicate-check-in indexes', () => {
    const patientIndexes = PatientModel.schema.indexes();
    expect(patientIndexes).toContainEqual([{ clinicId: 1, phone: 1 }, expect.objectContaining({ unique: true })]);
    expect(patientIndexes).toContainEqual([{ clinicId: 1, normalizedName: 1, isDeleted: 1 }, expect.any(Object)]);
    const queueIndexes = VisitQueueModel.schema.indexes();
    expect(queueIndexes).toContainEqual([{ clinicId: 1, doctorId: 1, queueDate: 1, queueNumber: 1 }, expect.objectContaining({ unique: true })]);
    expect(queueIndexes).toContainEqual([{ clinicId: 1, patientId: 1, queueDate: 1 }, expect.objectContaining({ unique: true })]);
    expect(queueIndexes).toContainEqual([
      { clinicId: 1, patientId: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { status: { $in: ['waiting', 'in_consultation'] } } }),
    ]);
    expect(queueIndexes).toContainEqual([
      { clinicId: 1, patientId: 1 },
      expect.objectContaining({ unique: true, partialFilterExpression: { status: { $in: ['waiting', 'in_consultation'] } } }),
    ]);
    expect(QueueCounterModel.modelName).toBe('QueueCounter');
    expect(otherClinicId).not.toBe(clinicId);
  });
});
