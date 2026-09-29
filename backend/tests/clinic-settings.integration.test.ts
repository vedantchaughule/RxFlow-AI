import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('clinic settings API with MongoDB persistence', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let AuditLogModel: typeof import('../src/modules/audit/audit-log.model.js').AuditLogModel;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let decrypt: typeof import('../src/shared/encryption.js').decrypt;
  let bcrypt: typeof import('bcryptjs').default;

  let firstClinicId = '';
  let secondClinicId = '';
  let adminToken = '';
  let adminWithoutMfaToken = '';
  let secondAdminToken = '';
  let doctorToken = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'clinic_settings');
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
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ decrypt } = await import('../src/shared/encryption.js'));
    ({ default: bcrypt } = await import('bcryptjs'));
    const { createApp } = await import('../src/app.js');

    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all([ClinicModel.syncIndexes(), UserModel.syncIndexes(), AuthSessionModel.syncIndexes(), AuditLogModel.syncIndexes()]);
    app = createApp();

    const clinics = await ClinicModel.create([
      { name: 'First Clinic', email: 'first-clinic@example.test' },
      { name: 'Second Clinic', email: 'second-clinic@example.test' },
    ]);
    const firstClinic = clinics[0];
    const secondClinic = clinics[1];
    if (!firstClinic || !secondClinic) throw new Error('Expected clinic fixtures');
    firstClinicId = String(firstClinic._id);
    secondClinicId = String(secondClinic._id);

    const passwordHash = await bcrypt.hash('ValidPassword!123', 12);
    const users = await UserModel.create([
      { clinicId: firstClinic._id, name: 'First Admin', email: 'first-admin@example.test', passwordHash, role: 'admin', mfaRequired: true, mfaEnrolled: true },
      { clinicId: firstClinic._id, name: 'First Doctor', email: 'first-doctor@example.test', passwordHash, role: 'doctor' },
      { clinicId: secondClinic._id, name: 'Second Admin', email: 'second-admin@example.test', passwordHash, role: 'admin', mfaRequired: true, mfaEnrolled: true },
    ]);
    const admin = users[0];
    const doctor = users[1];
    const secondAdmin = users[2];
    if (!admin || !doctor || !secondAdmin) throw new Error('Expected user fixtures');

    const issueTestToken = async (user: typeof admin, mfaVerified: boolean) => {
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

    adminToken = await issueTestToken(admin, true);
    adminWithoutMfaToken = await issueTestToken(admin, false);
    doctorToken = await issueTestToken(doctor, false);
    secondAdminToken = await issueTestToken(secondAdmin, true);
  }, 30_000);

  afterAll(async () => {
    if (mongoose?.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }, 30_000);

  it('rejects unauthenticated access to every clinic settings endpoint', async () => {
    const responses = await Promise.all([
      request(app).get('/api/v1/clinic/me'),
      request(app).patch('/api/v1/clinic/me').send({ name: 'No Access' }),
      request(app).patch('/api/v1/clinic/me/ai-config').send({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', modelName: 'test-model', apiKey: 'not-a-real-key' }),
      request(app).put('/api/v1/clinic/me/logo').set('Content-Type', 'image/png').send(Buffer.from('no access')),
      request(app).get('/api/v1/clinic/me/logo'),
      request(app).get('/api/v1/clinic/me/audit'),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('requires the admin role and accepts password-only admin sessions', async () => {
    const doctor = await request(app).get('/api/v1/clinic/me').set(bearer(doctorToken));
    expect(doctor.status).toBe(403);
    expect(doctor.body.error.code).toBe('FORBIDDEN');
    const doctorMutation = await request(app).patch('/api/v1/clinic/me').set(bearer(doctorToken)).send({ name: 'Forbidden change' });
    expect(doctorMutation.status).toBe(403);
    const doctorLogo = await request(app).put('/api/v1/clinic/me/logo').set(bearer(doctorToken)).set('Content-Type', 'image/png').send(Buffer.from('forbidden'));
    expect(doctorLogo.status).toBe(403);
    expect((await request(app).get('/api/v1/clinic/me/audit').set(bearer(doctorToken))).status).toBe(403);

    const passwordOnly = await request(app).get('/api/v1/clinic/me').set(bearer(adminWithoutMfaToken));
    expect(passwordOnly.status).toBe(200);
  });

  it('GET /clinic/me returns the authenticated clinic defaults without secret fields', async () => {
    const response = await request(app).get('/api/v1/clinic/me').set(bearer(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.data.clinic).toMatchObject({
      _id: firstClinicId,
      name: 'First Clinic',
      plan: 'starter',
      maxPatientsPerHour: 4,
      workingHours: { start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' },
      aiConfig: { isConfigured: false },
    });
    expect(response.body.data.clinic).not.toHaveProperty('razorpaySubscriptionId');
    expect(response.body.data.clinic.aiConfig).not.toHaveProperty('encryptedApiKey');
  });

  it('rejects empty, unknown, malformed, and logically invalid settings updates', async () => {
    const invalidBodies = [
      {},
      { unsupported: true },
      { phone: '9876543210' },
      { maxPatientsPerHour: 0 },
      { workingHours: { start: '18:00', end: '09:00', breakStart: '13:00', breakEnd: '14:00' } },
      { workingHours: { start: '09:00', end: '18:00', breakStart: '19:00', breakEnd: '20:00' } },
      { branding: { primaryColor: '#ffffff', accentColor: '#2563eb' } },
      { passwordPolicy: { minLength: 11, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSymbol: true } },
    ];
    for (const body of invalidBodies) {
      const response = await request(app).patch('/api/v1/clinic/me').set(bearer(adminToken)).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code, JSON.stringify(body)).toBe('VALIDATION_ERROR');
    }
    expect(await AuditLogModel.countDocuments({ clinicId: firstClinicId, action: 'clinic.settings_updated' })).toBe(0);
  });

  it('persists accessible branding and the clinic password policy', async () => {
    const body = {
      branding: { primaryColor: '#0f766e', accentColor: '#1d4ed8' },
      passwordPolicy: { minLength: 16, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSymbol: true },
    };
    const response = await request(app).patch('/api/v1/clinic/me').set(bearer(adminToken)).send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.clinic).toMatchObject(body);
    expect((await ClinicModel.findById(firstClinicId).lean())?.passwordPolicy).toMatchObject(body.passwordPolicy);
  });

  it('validates and persists a clinic-owned logo without accepting disguised files', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const invalidType = await request(app).put('/api/v1/clinic/me/logo').set(bearer(adminToken)).set('Content-Type', 'text/plain').send(png);
    expect(invalidType.status).toBe(415);
    expect(invalidType.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    const disguised = await request(app).put('/api/v1/clinic/me/logo').set(bearer(adminToken)).set('Content-Type', 'image/png').send(Buffer.from('not a png'));
    expect(disguised.status).toBe(400);
    expect(disguised.body.error.code).toBe('INVALID_FILE');

    const uploaded = await request(app).put('/api/v1/clinic/me/logo').set(bearer(adminToken)).set('Content-Type', 'image/png').send(png);
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.data.logo).toMatchObject({ contentType: 'image/png', size: png.length });
    expect(uploaded.body.data.logo.url).toBe('/api/v1/clinic/me/logo');

    const downloaded = await request(app).get('/api/v1/clinic/me/logo').set(bearer(adminToken));
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers['content-type']).toMatch(/^image\/png/);
    expect(Buffer.compare(downloaded.body, png)).toBe(0);
    expect(await AuditLogModel.countDocuments({ clinicId: firstClinicId, action: 'clinic.logo_updated' })).toBe(1);
  });

  it('supports clinic-scoped staff search, filters, pagination, conflicts, and audit history', async () => {
    const created = await request(app).post('/api/v1/auth/staff').set(bearer(adminToken)).send({
      name: 'Searchable Receptionist', email: 'searchable@example.test', role: 'receptionist', temporaryPassword: 'StrongTemporary!1234',
    });
    expect(created.status).toBe(201);
    const duplicate = await request(app).post('/api/v1/auth/staff').set(bearer(adminToken)).send({
      name: 'Duplicate Receptionist', email: 'searchable@example.test', role: 'receptionist', temporaryPassword: 'StrongTemporary!1234',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');

    const listed = await request(app).get('/api/v1/auth/staff?search=searchable&role=receptionist&status=active&page=1&limit=1').set(bearer(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.staff).toHaveLength(1);
    expect(listed.body.data.staff[0]).toMatchObject({ name: 'Searchable Receptionist', role: 'receptionist', status: 'active' });
    expect(listed.body.pagination).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });

    const foreign = await request(app).get('/api/v1/auth/staff?search=Second').set(bearer(adminToken));
    expect(foreign.body.data.staff).toEqual([]);
    const audit = await request(app).get('/api/v1/clinic/me/audit?page=1&limit=10').set(bearer(adminToken));
    expect(audit.status).toBe(200);
    expect(audit.body.data.events.some((event: { action: string }) => event.action === 'staff.created')).toBe(true);
    expect(JSON.stringify(audit.body)).not.toContain('StrongTemporary!1234');
  });

  it('PATCH /clinic/me persists validated settings and records field names only', async () => {
    const body = {
      name: 'First Clinic Updated',
      address: '10 Clinic Road',
      city: 'Pune',
      state: 'Maharashtra',
      phone: '+919876543210',
      logoUrl: 'https://cdn.example.test/clinic.png',
      registrationNumber: 'MH-CLINIC-101',
      maxPatientsPerHour: 6,
      workingHours: { start: '08:30', end: '17:30', breakStart: '12:30', breakEnd: '13:15' },
    };
    const response = await request(app).patch('/api/v1/clinic/me').set(bearer(adminToken)).send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.clinic).toMatchObject(body);
    const persisted = await ClinicModel.findById(firstClinicId).lean();
    expect(persisted).toMatchObject(body);
    const audit = await AuditLogModel.findOne({ clinicId: firstClinicId, action: 'clinic.settings_updated', 'metadata.fields': 'address' }).sort({ createdAt: -1 }).lean();
    expect(audit?.targetId).toBe(firstClinicId);
    expect(audit?.metadata).toEqual({ fields: Object.keys(body).sort() });
    expect(JSON.stringify(audit?.metadata)).not.toContain(body.address);
  });

  it('validates AI configuration before any secret is persisted', async () => {
    const invalidBodies = [
      { provider: 'unsupported', baseUrl: 'https://example.test', modelName: 'model', apiKey: 'not-a-real-key' },
      { provider: 'openai', baseUrl: 'http://example.test', modelName: 'model', apiKey: 'not-a-real-key' },
      { provider: 'openai', baseUrl: 'https://example.test', modelName: '', apiKey: 'short' },
      { provider: 'openai', baseUrl: 'https://example.test', modelName: 'model', apiKey: 'not-a-real-key', extra: true },
    ];
    for (const body of invalidBodies) {
      const response = await request(app).patch('/api/v1/clinic/me/ai-config').set(bearer(adminToken)).send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code, JSON.stringify(body)).toBe('VALIDATION_ERROR');
    }
    const persisted = await ClinicModel.findById(firstClinicId).select('+aiConfig.encryptedApiKey').lean();
    expect(persisted?.aiConfig?.isConfigured).toBe(false);
    expect(persisted?.aiConfig?.encryptedApiKey).toBeUndefined();
  });

  it('PATCH /clinic/me/ai-config encrypts the key and never exposes or audits it', async () => {
    const apiKey = 'integration-placeholder-api-key';
    const body = { provider: 'openai', baseUrl: 'https://api.openai.com/v1', modelName: 'review-only-model', apiKey } as const;
    const response = await request(app).patch('/api/v1/clinic/me/ai-config').set(bearer(adminToken)).send(body);
    expect(response.status).toBe(200);
    expect(response.body.data.clinic.aiConfig).toMatchObject({ provider: body.provider, baseUrl: body.baseUrl, modelName: body.modelName, isConfigured: true, enabled: false, killSwitch: false, timeoutMs: 10_000, maxContextVisits: 5 });
    expect(JSON.stringify(response.body)).not.toContain(apiKey);
    expect(response.body.data.clinic.aiConfig).not.toHaveProperty('encryptedApiKey');

    const persisted = await ClinicModel.findById(firstClinicId).select('+aiConfig.encryptedApiKey').lean();
    const encrypted = persisted?.aiConfig?.encryptedApiKey;
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toBe(apiKey);
    expect(decrypt(encrypted ?? '')).toBe(apiKey);

    const audit = await AuditLogModel.findOne({ clinicId: firstClinicId, action: 'clinic.ai_config_updated' }).lean();
    expect(audit?.metadata).toEqual({ provider: body.provider, modelName: body.modelName });
    expect(JSON.stringify(audit)).not.toContain(apiKey);
    expect(JSON.stringify(audit)).not.toContain(encrypted);
  });

  it('isolates reads and writes between clinics', async () => {
    const secondUpdate = await request(app).patch('/api/v1/clinic/me').set(bearer(secondAdminToken)).send({ name: 'Second Clinic Updated', city: 'Mumbai' });
    expect(secondUpdate.status).toBe(200);
    expect(secondUpdate.body.data.clinic._id).toBe(secondClinicId);

    const firstRead = await request(app).get('/api/v1/clinic/me').set(bearer(adminToken));
    expect(firstRead.body.data.clinic).toMatchObject({ _id: firstClinicId, name: 'First Clinic Updated', city: 'Pune' });
    const secondRead = await request(app).get('/api/v1/clinic/me').set(bearer(secondAdminToken));
    expect(secondRead.body.data.clinic).toMatchObject({ _id: secondClinicId, name: 'Second Clinic Updated', city: 'Mumbai' });
    expect(await AuditLogModel.countDocuments({ clinicId: firstClinicId, targetId: secondClinicId })).toBe(0);
  });

  it('declares the clinic identity and status indexes', () => {
    const indexes = ClinicModel.schema.indexes();
    expect(indexes).toContainEqual([{ email: 1 }, expect.objectContaining({ unique: true })]);
    expect(indexes).toContainEqual([{ status: 1 }, expect.any(Object)]);
  });
});
