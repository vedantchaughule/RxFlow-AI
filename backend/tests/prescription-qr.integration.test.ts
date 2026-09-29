import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('doctor-authored prescription finalization and opaque patient QR', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let AuditLogModel: typeof import('../src/modules/audit/audit-log.model.js').AuditLogModel;
  let PatientModel: typeof import('../src/modules/patients/patient.model.js').PatientModel;
  let VisitQueueModel: typeof import('../src/modules/patients/visit-queue.model.js').VisitQueueModel;
  let PrescriptionModel: typeof import('../src/modules/prescriptions/prescription.model.js').PrescriptionModel;
  let ClinicLogoModel: typeof import('../src/modules/clinics/clinic-logo.model.js').ClinicLogoModel;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let normalizePatientName: typeof import('../src/modules/patients/patient.service.js').normalizePatientName;
  let patientQrValue: typeof import('../src/modules/patients/patient-qr.service.js').patientQrValue;
  let decrypt: typeof import('../src/shared/encryption.js').decrypt;
  let bcrypt: typeof import('bcryptjs').default;

  let clinicId = '';
  let otherClinicId = '';
  let doctorId = '';
  let otherDoctorId = '';
  let patientId = '';
  let queueEntryId = '';
  let waitingPatientId = '';
  let waitingQueueEntryId = '';
  let otherPatientId = '';
  let otherQueueEntryId = '';
  let prescriptionId = '';
  let originalQrToken = '';
  let doctorToken = '';
  let receptionistToken = '';
  let adminToken = '';
  let otherAdminToken = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const validBody = (overrides: Record<string, unknown> = {}) => ({
    patientId,
    queueEntryId,
    diagnosis: 'Doctor-entered final diagnosis',
    doctorNotes: 'Doctor-entered follow-up note',
    medicines: [{ name: 'Doctor-entered medicine', dosage: 'Doctor-entered dose', frequency: 'Doctor-entered frequency', duration: 'Doctor-entered duration', instructions: 'Doctor-entered instructions' }],
    clinicianConfirmed: true,
    ...overrides,
  });

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'prescription_qr');
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
    ({ VisitQueueModel } = await import('../src/modules/patients/visit-queue.model.js'));
    ({ PrescriptionModel } = await import('../src/modules/prescriptions/prescription.model.js'));
    ({ ClinicLogoModel } = await import('../src/modules/clinics/clinic-logo.model.js'));
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ normalizePatientName } = await import('../src/modules/patients/patient.service.js'));
    ({ patientQrValue } = await import('../src/modules/patients/patient-qr.service.js'));
    ({ decrypt } = await import('../src/shared/encryption.js'));
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
      PrescriptionModel.syncIndexes(),
      ClinicLogoModel.syncIndexes(),
    ]);
    app = createApp();

    const clinics = await ClinicModel.create([
      { name: 'Prescription Clinic', email: 'prescription-clinic@example.test', registrationNumber: 'RX-TEST-001', branding: { primaryColor: '#0f766e', accentColor: '#2563eb' } },
      { name: 'Other Prescription Clinic', email: 'other-prescription-clinic@example.test' },
    ]);
    const clinic = clinics[0];
    const otherClinic = clinics[1];
    if (!clinic || !otherClinic) throw new Error('Expected clinic fixtures');
    clinicId = String(clinic._id);
    otherClinicId = String(otherClinic._id);

    const passwordHash = await bcrypt.hash('ValidPassword!123', 12);
    const users = await UserModel.create([
      { clinicId, name: 'Prescription Doctor', email: 'prescription-doctor@example.test', passwordHash, role: 'doctor' },
      { clinicId, name: 'Prescription Receptionist', email: 'prescription-reception@example.test', passwordHash, role: 'receptionist' },
      { clinicId, name: 'Prescription Admin', email: 'prescription-admin@example.test', passwordHash, role: 'admin', mfaRequired: true, mfaEnrolled: true },
      { clinicId: otherClinicId, name: 'Other Doctor', email: 'other-prescription-doctor@example.test', passwordHash, role: 'doctor' },
      { clinicId: otherClinicId, name: 'Other Admin', email: 'other-prescription-admin@example.test', passwordHash, role: 'admin', mfaRequired: true, mfaEnrolled: true },
    ]);
    const [doctor, receptionist, admin, otherDoctor, otherAdmin] = users;
    if (!doctor || !receptionist || !admin || !otherDoctor || !otherAdmin) throw new Error('Expected user fixtures');
    doctorId = String(doctor._id);
    otherDoctorId = String(otherDoctor._id);

    const issueToken = async (user: typeof doctor, mfaVerified: boolean) => {
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
      return signAccessToken({ userId: String(user._id), clinicId: String(user.clinicId), role: user.role, sessionVersion: user.sessionVersion, sessionId, mfaVerified });
    };
    doctorToken = await issueToken(doctor, false);
    receptionistToken = await issueToken(receptionist, false);
    adminToken = await issueToken(admin, true);
    otherAdminToken = await issueToken(otherAdmin, true);

    const patients = await PatientModel.create([
      { clinicId, assignedDoctorId: doctorId, registeredById: receptionist._id, name: 'QR Prescription Patient', normalizedName: normalizePatientName('QR Prescription Patient'), phone: '+919900002001', age: 41, gender: 'female', chiefComplaint: 'Clinician review required' },
      { clinicId, assignedDoctorId: doctorId, registeredById: receptionist._id, name: 'Waiting Patient', normalizedName: normalizePatientName('Waiting Patient'), phone: '+919900002002', age: 45, gender: 'male', chiefComplaint: 'Waiting visit' },
      { clinicId: otherClinicId, assignedDoctorId: otherDoctorId, registeredById: otherAdmin._id, name: 'Other Clinic Patient', normalizedName: normalizePatientName('Other Clinic Patient'), phone: '+919900002003', age: 39, gender: 'other', chiefComplaint: 'Other clinic visit' },
    ]);
    const [patient, waitingPatient, otherPatient] = patients;
    if (!patient || !waitingPatient || !otherPatient) throw new Error('Expected patient fixtures');
    patientId = String(patient._id);
    waitingPatientId = String(waitingPatient._id);
    otherPatientId = String(otherPatient._id);

    const queues = await VisitQueueModel.create([
      { clinicId, patientId, doctorId, checkedInById: receptionist._id, queueDate: '2026-08-01', queueNumber: 1, status: 'in_consultation', checkedInAt: new Date(), consultationStartedAt: new Date() },
      { clinicId, patientId: waitingPatientId, doctorId, checkedInById: receptionist._id, queueDate: '2026-08-01', queueNumber: 2, status: 'waiting', checkedInAt: new Date() },
      { clinicId: otherClinicId, patientId: otherPatientId, doctorId: otherDoctorId, checkedInById: otherAdmin._id, queueDate: '2026-08-01', queueNumber: 1, status: 'in_consultation', checkedInAt: new Date(), consultationStartedAt: new Date() },
    ]);
    const [queue, waitingQueue, otherQueue] = queues;
    if (!queue || !waitingQueue || !otherQueue) throw new Error('Expected queue fixtures');
    queueEntryId = String(queue._id);
    waitingQueueEntryId = String(waitingQueue._id);
    otherQueueEntryId = String(otherQueue._id);
  }, 30_000);

  afterAll(async () => {
    if (mongoose?.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }, 30_000);

  it('rejects unauthenticated and non-doctor prescription creation', async () => {
    const unauthenticated = await request(app).post('/api/v1/prescriptions').send(validBody());
    expect(unauthenticated.status).toBe(401);
    expect((await request(app).post('/api/v1/prescriptions').set(bearer(receptionistToken)).send(validBody())).status).toBe(403);
    expect((await request(app).post('/api/v1/prescriptions').set(bearer(adminToken)).send(validBody())).status).toBe(403);
    expect(await PrescriptionModel.countDocuments()).toBe(0);
  });

  it('requires complete structure and explicit clinician confirmation', async () => {
    const invalidBodies = [
      validBody({ clinicianConfirmed: false }),
      validBody({ medicines: [] }),
      validBody({ diagnosis: '' }),
      validBody({ unexpected: true }),
    ];
    for (const body of invalidBodies) {
      const response = await request(app).post('/api/v1/prescriptions').set(bearer(doctorToken)).send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await VisitQueueModel.findById(queueEntryId).lean())?.status).toBe('in_consultation');
    expect(await PrescriptionModel.countDocuments()).toBe(0);
  });

  it('rejects waiting and cross-clinic visits without partial writes', async () => {
    const waiting = await request(app).post('/api/v1/prescriptions').set(bearer(doctorToken)).send(validBody({ patientId: waitingPatientId, queueEntryId: waitingQueueEntryId }));
    expect(waiting.status).toBe(409);
    expect(waiting.body.error.code).toBe('VISIT_NOT_IN_CONSULTATION');
    const crossClinic = await request(app).post('/api/v1/prescriptions').set(bearer(doctorToken)).send(validBody({ patientId: otherPatientId, queueEntryId: otherQueueEntryId }));
    expect(crossClinic.status).toBe(404);
    expect(await PrescriptionModel.countDocuments()).toBe(0);
    expect((await PatientModel.findById(waitingPatientId).lean())?.totalVisits).toBe(0);
  });

  it('atomically finalizes the doctor-authored prescription, visit, and opaque QR', async () => {
    const response = await request(app).post('/api/v1/prescriptions').set(bearer(doctorToken)).send(validBody());
    expect(response.status).toBe(201);
    expect(response.body.data.prescription).toMatchObject({ patientId, doctorId, queueEntryId, source: 'manual', deliveryStatus: 'pending' });
    expect(response.body.data.prescription.medicines[0]).toMatchObject({ name: 'Doctor-entered medicine', dosage: 'Doctor-entered dose' });
    expect(response.body.data.qrCode).toMatchObject({ contentType: 'image/png', format: 'png', containsPatientData: false });
    expect(response.body.data.qrCode.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(response.body.data.delivery).toMatchObject({ status: 'not_queued' });
    expect(response.body.data.delivery.status).not.toMatch(/accepted|sent|delivered|read/);
    prescriptionId = response.body.data.prescription._id;

    expect((await VisitQueueModel.findById(queueEntryId).lean())?.status).toBe('completed');
    const patient = await PatientModel.findById(patientId).select('+qrTokenHash +qrTokenEncrypted').lean();
    expect(patient?.totalVisits).toBe(1);
    expect(patient?.lastVisitDate).toBeTruthy();
    expect(patient?.qrTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(patient?.qrTokenEncrypted).toBeTruthy();
    originalQrToken = decrypt(patient?.qrTokenEncrypted ?? '');
    expect(originalQrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const qrValue = patientQrValue(originalQrToken);
    expect(qrValue).toBe(`http://localhost:5173/checkin/${originalQrToken}`);
    for (const pii of ['QR Prescription Patient', '+919900002001', 'Doctor-entered final diagnosis', 'Doctor-entered medicine']) expect(qrValue).not.toContain(pii);
  });

  it('prevents a second final prescription and a second visit count', async () => {
    const response = await request(app).post('/api/v1/prescriptions').set(bearer(doctorToken)).send(validBody());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PRESCRIPTION_EXISTS');
    expect(await PrescriptionModel.countDocuments({ clinicId, queueEntryId })).toBe(1);
    expect((await PatientModel.findById(patientId).lean())?.totalVisits).toBe(1);
  });

  it('does not permit a final prescription’s clinical content to be silently changed', async () => {
    await expect(PrescriptionModel.updateOne(
      { _id: prescriptionId, clinicId },
      { $set: { diagnosis: 'A different diagnosis that must not replace the final record' } },
      { runValidators: true },
    )).rejects.toThrow('immutable');
    expect((await PrescriptionModel.findById(prescriptionId).lean())?.diagnosis).toBe('Doctor-entered final diagnosis');
  });

  it('resolves the opaque QR only for authorized staff in the owning clinic', async () => {
    const resolved = await request(app).get(`/api/v1/patients/qr/${originalQrToken}`).set(bearer(receptionistToken));
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.patient).toMatchObject({ _id: patientId, name: 'QR Prescription Patient' });
    expect(resolved.body.data.patient).toHaveProperty('maskedPhone');
    expect(resolved.body.data.patient).not.toHaveProperty('phone');
    expect(resolved.body.data.patient).not.toHaveProperty('chiefComplaint');
    const crossClinic = await request(app).get(`/api/v1/patients/qr/${originalQrToken}`).set(bearer(otherAdminToken));
    expect(crossClinic.status).toBe(404);
    expect((await request(app).get(`/api/v1/patients/qr/${originalQrToken}`)).status).toBe(401);
  });

  it('retrieves the QR without exposing its token and rotates it only as an admin', async () => {
    const qr = await request(app).get(`/api/v1/patients/${patientId}/qr`).set(bearer(doctorToken));
    expect(qr.status).toBe(200);
    expect(qr.body.data.qrCode.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(qr.body)).not.toContain(originalQrToken);
    expect((await request(app).post(`/api/v1/patients/${patientId}/qr/rotate`).set(bearer(doctorToken))).status).toBe(403);

    const rotated = await request(app).post(`/api/v1/patients/${patientId}/qr/rotate`).set(bearer(adminToken));
    expect(rotated.status).toBe(200);
    const patient = await PatientModel.findById(patientId).select('+qrTokenEncrypted').lean();
    const newToken = decrypt(patient?.qrTokenEncrypted ?? '');
    expect(newToken).not.toBe(originalQrToken);
    expect((await request(app).get(`/api/v1/patients/qr/${originalQrToken}`).set(bearer(receptionistToken))).status).toBe(404);
    expect((await request(app).get(`/api/v1/patients/qr/${newToken}`).set(bearer(receptionistToken))).status).toBe(200);
  });

  it('lists and reads prescriptions only within the clinic and blocks receptionists', async () => {
    const listed = await request(app).get('/api/v1/prescriptions').set(bearer(doctorToken)).query({ patientId });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0]._id).toBe(prescriptionId);
    expect((await request(app).get('/api/v1/prescriptions').set(bearer(receptionistToken)).query({ patientId })).status).toBe(403);
    const crossClinicList = await request(app).get('/api/v1/prescriptions').set(bearer(otherAdminToken)).query({ patientId });
    expect(crossClinicList.status).toBe(404);
    const read = await request(app).get(`/api/v1/prescriptions/${prescriptionId}`).set(bearer(adminToken));
    expect(read.status).toBe(200);
    expect(read.body.data.prescription._id).toBe(prescriptionId);
    expect((await request(app).get(`/api/v1/prescriptions/${prescriptionId}`).set(bearer(otherAdminToken))).status).toBe(404);
  });

  it('returns a branded printable PDF only to authorized clinic clinicians and records a redacted audit event', async () => {
    await ClinicLogoModel.create({
      clinicId,
      contentType: 'image/png',
      data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/PwAAAABJRU5ErkJggg==', 'base64'),
      size: 70,
    });
    const unauthenticated = await request(app).get(`/api/v1/prescriptions/${prescriptionId}/pdf`);
    expect(unauthenticated.status).toBe(401);
    expect((await request(app).get(`/api/v1/prescriptions/${prescriptionId}/pdf`).set(bearer(receptionistToken))).status).toBe(403);
    expect((await request(app).get(`/api/v1/prescriptions/${prescriptionId}/pdf`).set(bearer(otherAdminToken))).status).toBe(404);

    const response = await request(app).get(`/api/v1/prescriptions/${prescriptionId}/pdf`).set(bearer(doctorToken));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/pdf/);
    expect(response.headers['content-disposition']).toMatch(/^inline; filename="prescription-/);
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(response.body.length).toBeGreaterThan(500);

    const audit = await AuditLogModel.findOne({ clinicId, action: 'prescription.pdf_viewed', targetId: prescriptionId }).lean();
    expect(audit).toBeTruthy();
    const serialized = JSON.stringify(audit);
    for (const privateValue of ['Doctor-entered final diagnosis', 'Doctor-entered medicine', '+919900002001']) expect(serialized).not.toContain(privateValue);
  });

  it('allows exactly one concurrent finalization for a second in-consultation visit', async () => {
    const patient = await PatientModel.create({
      clinicId,
      assignedDoctorId: doctorId,
      registeredById: doctorId,
      name: 'Concurrent Finalization Patient',
      normalizedName: normalizePatientName('Concurrent Finalization Patient'),
      phone: '+919900002004',
      age: 50,
      gender: 'female',
      chiefComplaint: 'Concurrent finalization test',
    });
    const queue = await VisitQueueModel.create({
      clinicId,
      patientId: patient._id,
      doctorId,
      checkedInById: doctorId,
      queueDate: '2026-08-02',
      queueNumber: 3,
      status: 'in_consultation',
      checkedInAt: new Date(),
      consultationStartedAt: new Date(),
    });
    const payload = validBody({ patientId: String(patient._id), queueEntryId: String(queue._id) });
    const [first, second] = await Promise.all([
      request(app).post('/api/v1/prescriptions').set(bearer(doctorToken)).send(payload),
      request(app).post('/api/v1/prescriptions').set(bearer(doctorToken)).send(payload),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await PrescriptionModel.countDocuments({ clinicId, queueEntryId: queue._id })).toBe(1);
    expect((await PatientModel.findById(patient._id).lean())?.totalVisits).toBe(1);
    expect((await VisitQueueModel.findById(queue._id).lean())?.status).toBe('completed');
  });

  it('audits the workflow without diagnosis, medicine, phone, or QR token data', async () => {
    const audits = await AuditLogModel.find({ clinicId, action: { $in: ['prescription.created', 'prescription.pdf_viewed', 'queue.status_changed', 'patient.qr_resolved', 'patient.qr_rotated'] } }).lean();
    expect(audits.length).toBeGreaterThanOrEqual(4);
    const serialized = JSON.stringify(audits);
    for (const secret of ['Doctor-entered final diagnosis', 'Doctor-entered medicine', '+919900002001', originalQrToken]) expect(serialized).not.toContain(secret);
  });

  it('declares prescription visit uniqueness and patient QR lookup indexes', () => {
    expect(PrescriptionModel.schema.indexes()).toContainEqual([{ clinicId: 1, queueEntryId: 1 }, expect.objectContaining({ unique: true })]);
    expect(PatientModel.schema.indexes()).toContainEqual([{ clinicId: 1, qrTokenHash: 1 }, expect.objectContaining({ unique: true })]);
    expect(otherClinicId).not.toBe(clinicId);
  });
});
