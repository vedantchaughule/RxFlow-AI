import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('clinic-scoped doctor-reviewed AI assistance', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let PatientModel: typeof import('../src/modules/patients/patient.model.js').PatientModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let AiRunModel: typeof import('../src/modules/ai/ai-run.model.js').AiRunModel;
  let AuditLogModel: typeof import('../src/modules/audit/audit-log.model.js').AuditLogModel;
  let setProvider: typeof import('../src/modules/ai/ai.service.js').setAiProviderFactoryForTests;
  let doctorToken = ''; let adminToken = ''; let receptionistToken = ''; let otherDoctorToken = '';
  let patientId = ''; let otherPatientId = ''; let clinicId = '';
  const providerGenerate = vi.fn();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const validOutput = { diagnosis: '', doctorNotes: 'Draft note', medicines: [], patientInstructions: 'Review instructions.', missingFields: ['diagnosis'], conflicts: [], safetyWarnings: [], insufficientContext: true };

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'ai_assistance'); process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-sixty-four-characters-long-for-validation'; process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-sixty-four-characters-long-for-validation';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; process.env.CLIENT_URL = 'http://localhost:5173'; process.env.CORS_ORIGINS = 'http://localhost:5173'; process.env.COOKIE_SECURE = 'false'; process.env.PLATFORM_SUPPORT_KEY = 'test-platform-support-key-that-is-long-enough'; process.env.AI_KILL_SWITCH = 'false';
    ({ default: mongoose } = await import('mongoose')); ({ ClinicModel } = await import('../src/modules/clinics/clinic.model.js')); ({ UserModel } = await import('../src/modules/users/user.model.js')); ({ PatientModel } = await import('../src/modules/patients/patient.model.js')); ({ AuthSessionModel } = await import('../src/modules/auth/auth-session.model.js')); ({ AiRunModel } = await import('../src/modules/ai/ai-run.model.js')); ({ AuditLogModel } = await import('../src/modules/audit/audit-log.model.js'));
    const { signAccessToken } = await import('../src/shared/jwt.js'); const { encrypt } = await import('../src/shared/encryption.js'); ({ setAiProviderFactoryForTests: setProvider } = await import('../src/modules/ai/ai.service.js')); const { createApp } = await import('../src/app.js'); const bcrypt = (await import('bcryptjs')).default;
    await mongoose.connect(process.env.MONGODB_URI); await mongoose.connection.dropDatabase(); await Promise.all([ClinicModel.syncIndexes(), UserModel.syncIndexes(), PatientModel.syncIndexes(), AuthSessionModel.syncIndexes(), AiRunModel.syncIndexes(), AuditLogModel.syncIndexes()]);
    const [clinic, otherClinic] = await ClinicModel.create([{ name: 'AI Clinic', email: 'ai@example.test', aiConfig: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', modelName: 'configured-model', encryptedApiKey: encrypt('provider-secret'), isConfigured: true, enabled: true, killSwitch: false, timeoutMs: 1000, maxContextVisits: 3 } }, { name: 'Other AI Clinic', email: 'other-ai@example.test', aiConfig: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', modelName: 'configured-model', encryptedApiKey: encrypt('other-secret'), isConfigured: true, enabled: true } }]);
    if (!clinic || !otherClinic) throw new Error('clinic fixtures'); clinicId = String(clinic._id); const passwordHash = await bcrypt.hash('ValidPassword!123', 4);
    const [doctor, admin, receptionist, otherDoctor] = await UserModel.create([{ clinicId: clinic._id, name: 'Doctor', email: 'doctor-ai@example.test', passwordHash, role: 'doctor' }, { clinicId: clinic._id, name: 'Admin', email: 'admin-ai@example.test', passwordHash, role: 'admin' }, { clinicId: clinic._id, name: 'Reception', email: 'reception-ai@example.test', passwordHash, role: 'receptionist' }, { clinicId: otherClinic._id, name: 'Other Doctor', email: 'other-doctor-ai@example.test', passwordHash, role: 'doctor' }]);
    if (!doctor || !admin || !receptionist || !otherDoctor) throw new Error('user fixtures');
    const [patient, otherPatient] = await PatientModel.create([{ clinicId: clinic._id, assignedDoctorId: doctor._id, registeredById: receptionist._id, name: 'Synthetic Patient', normalizedName: 'synthetic patient', phone: '+919000000100', age: 40, gender: 'other' }, { clinicId: otherClinic._id, assignedDoctorId: otherDoctor._id, registeredById: otherDoctor._id, name: 'Other Synthetic', normalizedName: 'other synthetic', phone: '+919000000101', age: 50, gender: 'other' }]);
    if (!patient || !otherPatient) throw new Error('patient fixtures'); patientId = String(patient._id); otherPatientId = String(otherPatient._id);
    async function token(user: NonNullable<typeof doctor>) { const sessionId = crypto.randomUUID(); await AuthSessionModel.create({ userId: user._id, clinicId: user.clinicId, sessionId, refreshTokenHash: await bcrypt.hash(crypto.randomUUID(), 4), issuedAt: new Date(), lastActivityAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) }); return signAccessToken({ userId: String(user._id), clinicId: String(user.clinicId), role: user.role, sessionVersion: user.sessionVersion, sessionId, mfaVerified: false }); }
    [doctorToken, adminToken, receptionistToken, otherDoctorToken] = await Promise.all([token(doctor), token(admin), token(receptionist), token(otherDoctor)]);
    setProvider(() => ({ name: 'openai', generate: providerGenerate })); app = createApp();
  }, 30_000);
  afterAll(async () => { setProvider(); await mongoose.disconnect(); });

  it('rejects unauthenticated, admin, and receptionist inference', async () => {
    const body = { task: 'structured_draft', notes: 'Synthetic notes' };
    expect((await request(app).post('/api/v1/ai/prescription-assist').send(body)).status).toBe(401);
    expect((await request(app).post('/api/v1/ai/prescription-assist').set(bearer(adminToken)).send(body)).status).toBe(403);
    expect((await request(app).post('/api/v1/ai/prescription-assist').set(bearer(receptionistToken)).send(body)).status).toBe(403);
  });
  it('prevents cross-clinic and non-assigned-patient context access', async () => {
    const response = await request(app).post('/api/v1/ai/prescription-assist').set(bearer(doctorToken)).send({ task: 'structured_draft', notes: 'Synthetic notes', patientId: otherPatientId });
    expect(response.status).toBe(404); expect(providerGenerate).not.toHaveBeenCalled();
  });
  it('returns an explicitly labelled review-only draft without changing queue or prescriptions', async () => {
    providerGenerate.mockResolvedValueOnce({ json: validOutput, inputTokens: 20, outputTokens: 10, estimatedCostMicros: 15 });
    const response = await request(app).post('/api/v1/ai/prescription-assist').set(bearer(doctorToken)).send({ task: 'structured_draft', notes: 'Synthetic notes', patientId });
    expect(response.status).toBe(200); expect(response.body.data).toMatchObject({ label: 'AI-generated draft', requiresDoctorReview: true, output: validOutput });
    expect(await AiRunModel.countDocuments({ clinicId, status: 'succeeded' })).toBe(1);
    const audit = await AuditLogModel.findOne({ clinicId, action: 'ai.draft_generated' }).lean(); expect(audit?.metadata).not.toHaveProperty('notes'); expect(JSON.stringify(audit?.metadata)).not.toContain('Synthetic notes');
  });
  it('rejects malformed and unsafe provider output and records no clinical content', async () => {
    providerGenerate.mockResolvedValueOnce({ json: { diagnosis: 42 } });
    const response = await request(app).post('/api/v1/ai/prescription-assist').set(bearer(doctorToken)).send({ task: 'structured_draft', notes: 'Private synthetic note' });
    expect(response.status).toBe(502); expect(response.body.error.code).toBe('AI_MALFORMED_OUTPUT');
    expect(JSON.stringify(await AiRunModel.findOne({ status: 'failed' }).lean())).not.toContain('Private synthetic note');
  });
  it('retries provider failure once, then gives a manual fallback state', async () => {
    providerGenerate.mockRejectedValueOnce(new Error('provider down')).mockRejectedValueOnce(new Error('provider down'));
    const response = await request(app).post('/api/v1/ai/prescription-assist').set(bearer(doctorToken)).send({ task: 'structured_draft', notes: 'Synthetic notes' });
    expect(response.status).toBe(503); expect(response.body.error.code).toBe('AI_PROVIDER_UNAVAILABLE');
  });
  it('records clinician rejection and cannot reject another clinic run', async () => {
    const run = await AiRunModel.findOne({ clinicId, status: 'succeeded' }); if (!run) throw new Error('run fixture');
    expect((await request(app).post(`/api/v1/ai/runs/${run._id}/reject`).set(bearer(otherDoctorToken)).send({ reason: 'incorrect' })).status).toBe(404);
    const response = await request(app).post(`/api/v1/ai/runs/${run._id}/reject`).set(bearer(doctorToken)).send({ reason: 'incorrect' }); expect(response.status).toBe(200);
    expect((await AiRunModel.findById(run._id).lean())?.status).toBe('rejected');
  });
});
