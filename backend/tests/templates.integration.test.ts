import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('prescription templates integration', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let PrescriptionTemplate: typeof import('../src/modules/templates/template.model.js').PrescriptionTemplate;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let bcrypt: typeof import('bcryptjs').default;

  let doctorToken = '';
  let receptionistToken = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'templates');
    ({ default: mongoose } = await import('mongoose'));
    ({ ClinicModel } = await import('../src/modules/clinics/clinic.model.js'));
    ({ UserModel } = await import('../src/modules/users/user.model.js'));
    ({ AuthSessionModel } = await import('../src/modules/auth/auth-session.model.js'));
    ({ PrescriptionTemplate } = await import('../src/modules/templates/template.model.js'));
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ default: bcrypt } = await import('bcryptjs'));
    const { createApp } = await import('../src/app.js');

    await mongoose.connect(process.env.MONGODB_URI);
    app = createApp();

    const clinic = await ClinicModel.create({
      name: 'Template Clinic',
      email: 'template@clinic.test',
      phone: '+919876543210',
      address: '123 Health Ave',
      city: 'Mumbai',
      state: 'Maharashtra',
      plan: 'pro',
      status: 'active',
      passwordPolicy: { minLength: 12, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSymbol: false },
    });

    const passwordHash = await bcrypt.hash('Password12345!', 4);
    const [doctor, receptionist] = await UserModel.create([
      { clinicId: clinic._id, name: 'Dr. Template', email: 'dr.template@clinic.test', passwordHash, role: 'doctor', status: 'active' },
      { clinicId: clinic._id, name: 'Receptionist Sam', email: 'sam@clinic.test', passwordHash, role: 'receptionist', status: 'active' },
    ]);
    if (!doctor || !receptionist) throw new Error('Expected template test users');

    const issueToken = async (user: typeof doctor) => {
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
        sessionVersion: user.sessionVersion,
        sessionId,
        mfaVerified: false,
      });
    };

    doctorToken = await issueToken(doctor);
    receptionistToken = await issueToken(receptionist);
  });

  afterAll(async () => {
    if (mongoose?.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it('allows doctors to create, list, update, and delete prescription templates', async () => {
    // Create Template
    const createRes = await request(app)
      .post('/api/v1/templates')
      .set(bearer(doctorToken))
      .send({
        title: 'Viral Fever Standard',
        diagnosis: 'Acute Viral Fever with mild dehydration',
        doctorNotes: 'Rest and adequate hydration',
        medicines: [
          { name: 'Paracetamol', dosage: '650mg', frequency: 'Thrice daily', duration: '3 days', instructions: 'After food' },
          { name: 'ORS', dosage: '1 sachet', frequency: 'As needed', duration: '3 days', instructions: 'Dissolve in 1L water' },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.template.title).toBe('Viral Fever Standard');

    const templateId = createRes.body.data.template._id;

    // List Templates
    const listRes = await request(app)
      .get('/api/v1/templates')
      .set(bearer(doctorToken));

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.templates.length).toBe(1);
    expect(listRes.body.data.templates[0].title).toBe('Viral Fever Standard');

    // Update Template
    const updateRes = await request(app)
      .patch(`/api/v1/templates/${templateId}`)
      .set(bearer(doctorToken))
      .send({ title: 'Viral Fever Standard (Updated)' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.template.title).toBe('Viral Fever Standard (Updated)');

    // Delete Template
    const deleteRes = await request(app)
      .delete(`/api/v1/templates/${templateId}`)
      .set(bearer(doctorToken));

    expect(deleteRes.status).toBe(200);

    const count = await PrescriptionTemplate.countDocuments({ _id: templateId });
    expect(count).toBe(0);
  });

  it('rejects receptionists from managing templates', async () => {
    const res = await request(app)
      .get('/api/v1/templates')
      .set(bearer(receptionistToken));

    expect(res.status).toBe(403);
  });
});
