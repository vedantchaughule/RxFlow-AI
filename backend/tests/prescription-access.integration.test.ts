import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('prescription access status, share links, and public patient portal', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let AuditLogModel: typeof import('../src/modules/audit/audit-log.model.js').AuditLogModel;
  let PatientModel: typeof import('../src/modules/patients/patient.model.js').PatientModel;
  let VisitQueueModel: typeof import('../src/modules/patients/visit-queue.model.js').VisitQueueModel;
  let PrescriptionModel: typeof import('../src/modules/prescriptions/prescription.model.js').PrescriptionModel;
  let PrescriptionShareLinkModel: typeof import('../src/modules/prescriptions/prescription-share-link.model.js').PrescriptionShareLinkModel;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let normalizePatientName: typeof import('../src/modules/patients/patient.service.js').normalizePatientName;
  let createPatientQrMaterial: typeof import('../src/modules/patients/patient-qr.service.js').createPatientQrMaterial;
  let bcrypt: typeof import('bcryptjs').default;

  let clinicId = '';
  let otherClinicId = '';
  let doctorId = '';
  let patientId = '';
  let queueEntryId = '';
  let prescriptionId = '';
  let doctorToken = '';
  let receptionistToken = '';
  let otherDoctorToken = '';
  let createdRawToken = '';
  let createdShareLinkId = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'prescription_access');
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
    ({ PrescriptionShareLinkModel } = await import('../src/modules/prescriptions/prescription-share-link.model.js'));
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ normalizePatientName } = await import('../src/modules/patients/patient.service.js'));
    ({ createPatientQrMaterial } = await import('../src/modules/patients/patient-qr.service.js'));
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
      PrescriptionShareLinkModel.syncIndexes(),
    ]);
    app = createApp();

    const clinics = await ClinicModel.create([
      { name: 'Apex Heart Care', email: 'apex@example.test', phone: '+919988776655', registrationNumber: 'RX-APEX-001' },
      { name: 'Other Clinic', email: 'other@example.test', phone: '+919988776600' },
    ]);
    clinicId = String(clinics[0]!._id);
    otherClinicId = String(clinics[1]!._id);

    const passwordHash = await bcrypt.hash('ValidPassword!123', 12);
    const users = await UserModel.create([
      { clinicId, name: 'Dr. Arjun Mehta', email: 'dr.mehta@example.test', passwordHash, role: 'doctor' },
      { clinicId, name: 'Rita Reception', email: 'reception@example.test', passwordHash, role: 'receptionist' },
      { clinicId: otherClinicId, name: 'Dr. Strange', email: 'strange@example.test', passwordHash, role: 'doctor' },
    ]);
    doctorId = String(users[0]!._id);

    const issueToken = async (user: (typeof users)[0]) => {
      const sessionId = crypto.randomUUID();
      await AuthSessionModel.create({
        userId: user._id,
        clinicId: user.clinicId,
        sessionId,
        refreshTokenHash: await bcrypt.hash(crypto.randomUUID(), 4),
        issuedAt: new Date(),
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      return signAccessToken({
        userId: String(user._id),
        clinicId: String(user.clinicId),
        role: user.role,
        sessionId,
        sessionVersion: user.sessionVersion,
        mfaVerified: false,
      });
    };

    doctorToken = await issueToken(users[0]!);
    receptionistToken = await issueToken(users[1]!);
    otherDoctorToken = await issueToken(users[2]!);

    const qrMaterial = createPatientQrMaterial();
    const patient = await PatientModel.create({
      clinicId,
      assignedDoctorId: doctorId,
      registeredById: doctorId,
      name: 'Riya Sharma',
      normalizedName: normalizePatientName('Riya Sharma'),
      phone: '+919876543210',
      age: 29,
      gender: 'female',
      chiefComplaint: 'Mild chest pain and shortness of breath',
      qrTokenHash: qrMaterial.tokenHash,
      qrTokenEncrypted: qrMaterial.tokenEncrypted,
      qrIssuedAt: qrMaterial.issuedAt,
    });
    patientId = String(patient._id);

    const queue = await VisitQueueModel.create({
      clinicId,
      patientId: patient._id,
      doctorId,
      checkedInById: doctorId,
      queueDate: '2026-08-01',
      queueNumber: 1,
      status: 'completed',
      checkedInAt: new Date(),
      consultationStartedAt: new Date(),
      completedAt: new Date(),
    });
    queueEntryId = String(queue._id);

    const prescription = await PrescriptionModel.create({
      clinicId,
      patientId,
      doctorId,
      queueEntryId,
      visitDate: new Date(),
      diagnosis: 'Costochondritis',
      doctorNotes: 'Rest and follow up in 5 days',
      medicines: [
        { name: 'Paracetamol 650mg', dosage: '650mg', frequency: 'TDS (3 times a day)', duration: '5 days', instructions: 'After food' },
      ],
      source: 'manual',
      clinicianConfirmedAt: new Date(),
    });
    prescriptionId = String(prescription._id);
  });

  afterAll(async () => {
    await mongoose?.disconnect();
  });

  it('returns initial access status when no share link has been created', async () => {
    const res = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}/access-status`)
      .set(bearer(doctorToken));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      prescriptionId,
      pdfStatus: 'Ready',
      accessStatus: 'Not Generated',
      activeLink: null,
    });
    expect(res.body.data.timeline.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.timeline[0]).toMatchObject({
      action: 'prescription.created',
      title: 'Prescription Finalized',
    });
  });

  it('enforces clinic isolation and role authorization for access status', async () => {
    const crossClinicRes = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}/access-status`)
      .set(bearer(otherDoctorToken));
    expect(crossClinicRes.status).toBe(404);

    const unauthRes = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}/access-status`);
    expect(unauthRes.status).toBe(401);
  });

  it('allows doctor to create a secure patient share link with QR code', async () => {
    const receptionistRes = await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/share-links`)
      .set(bearer(receptionistToken));
    expect(receptionistRes.status).toBe(403);

    const res = await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/share-links`)
      .set(bearer(doctorToken));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('rawToken');
    expect(res.body.data).toHaveProperty('url');
    expect(res.body.data).toHaveProperty('qrCodeDataUrl');
    expect(res.body.data.rawToken.length).toBe(43);
    expect(res.body.data.url).toContain(`/prescription/${res.body.data.rawToken}`);
    expect(res.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.shareLink).toMatchObject({
      status: 'active',
      maxViews: 20,
      viewCount: 0,
    });

    createdRawToken = res.body.data.rawToken;
    createdShareLinkId = res.body.data.shareLink.id;

    // Verify audit
    const audit = await AuditLogModel.findOne({ clinicId, action: 'prescription.share_link_created', targetId: prescriptionId });
    expect(audit).toBeTruthy();
  });

  it('reflects active share link and QR code in access status query', async () => {
    const res = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}/access-status`)
      .set(bearer(doctorToken));

    expect(res.status).toBe(200);
    expect(res.body.data.accessStatus).toBe('Active');
    expect(res.body.data.activeLink).toMatchObject({
      id: createdShareLinkId,
      status: 'active',
      viewCount: 0,
      maxViews: 20,
    });
    expect(res.body.data.url).toContain(`/prescription/${createdRawToken}`);
    expect(res.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.timeline.length).toBeGreaterThanOrEqual(2);
  });

  it('allows doctor to download authenticated clinic copy of PDF', async () => {
    const res = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}/pdf/download`)
      .set(bearer(doctorToken));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(`attachment; filename="rxflow-prescription-${prescriptionId}.pdf"`);
    expect(res.body.length).toBeGreaterThan(100);
  });

  it('allows patient to fetch public prescription summary with privacy masking', async () => {
    const res = await request(app)
      .get(`/api/v1/public/prescriptions/${createdRawToken}/summary`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      clinicName: 'Apex Heart Care',
      clinicPhone: '+919988776655',
      doctorName: 'Dr. Arjun Mehta',
      maskedPatientName: 'R**a S****a',
      viewCount: 0,
      maxViews: 20,
    });
    // Ensure raw patient full name is not exposed in public summary
    expect(res.body.data.maskedPatientName).not.toBe('Riya Sharma');
  });

  it('allows patient to view and download PDF and tracks access counts', async () => {
    // 1. View PDF
    const viewRes = await request(app)
      .get(`/api/v1/public/prescriptions/${createdRawToken}/pdf`);

    expect(viewRes.status).toBe(200);
    expect(viewRes.headers['content-type']).toBe('application/pdf');
    expect(viewRes.headers['content-disposition']).toContain('inline; filename="rxflow-prescription.pdf"');
    expect(viewRes.body.length).toBeGreaterThan(100);

    // 2. Download PDF
    const downloadRes = await request(app)
      .get(`/api/v1/public/prescriptions/${createdRawToken}/pdf/download`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe('application/pdf');
    expect(downloadRes.headers['content-disposition']).toContain('attachment; filename="rxflow-prescription.pdf"');

    // 3. Verify viewCount incremented
    const summaryRes = await request(app)
      .get(`/api/v1/public/prescriptions/${createdRawToken}/summary`);
    expect(summaryRes.body.data.viewCount).toBe(2);
  });

  it('allows doctor to revoke patient access and blocks subsequent public access', async () => {
    const revokeRes = await request(app)
      .post(`/api/v1/prescriptions/${prescriptionId}/share-links/${createdShareLinkId}/revoke`)
      .set(bearer(doctorToken));

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data).toEqual({ revoked: true });

    // Status query reflects Revoked
    const statusRes = await request(app)
      .get(`/api/v1/prescriptions/${prescriptionId}/access-status`)
      .set(bearer(doctorToken));
    expect(statusRes.body.data.accessStatus).toBe('Revoked');

    // Public summary returns 410 Gone
    const publicSummaryRes = await request(app)
      .get(`/api/v1/public/prescriptions/${createdRawToken}/summary`);
    expect(publicSummaryRes.status).toBe(410);
    expect(publicSummaryRes.body.error.message).toContain('revoked');

    // Public PDF returns 410 Gone
    const publicPdfRes = await request(app)
      .get(`/api/v1/public/prescriptions/${createdRawToken}/pdf`);
    expect(publicPdfRes.status).toBe(410);
  });
});
