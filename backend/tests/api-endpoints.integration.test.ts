import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';
import { buildReceptionist, FACTORY_PASSWORD, resetFactorySequence } from './support/factories.js';

describe('all API endpoints with MongoDB persistence', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let PasswordResetTokenModel: typeof import('../src/modules/auth/password-reset-token.model.js').PasswordResetTokenModel;
  let AuditLogModel: typeof import('../src/modules/audit/audit-log.model.js').AuditLogModel;
  let generateSync: typeof import('otplib').generateSync;
  let bcrypt: typeof import('bcryptjs').default;

  const password = 'ValidPassword!123';
  const changedPassword = 'ChangedPassword!456';
  const staffPassword = 'StaffPassword!123';
  const resetPassword = 'ResetPassword!789';
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adminEmail = `api-admin-${runId}@example.test`;
  const staffEmail = `api-staff-${runId}@example.test`;
  const secondAdminEmail = `api-admin-2-${runId}@example.test`;
  const resetSubjectEmail = `api-reset-${runId}@example.test`;
  const supportKey = 'test-platform-support-key-that-is-long-enough';

  let adminToken = '';
  let adminCookie = '';
  let adminId = '';
  let clinicId = '';
  let mfaSecret = '';
  let staffId = '';
  let resetSubjectId = '';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const cookieValue = (response: request.Response): string => {
    const raw = response.headers['set-cookie'];
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (!first) throw new Error('Expected refresh cookie');
    return first.split(';')[0] ?? '';
  };

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'api_endpoints');
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-sixty-four-characters-long-for-validation';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-sixty-four-characters-long-for-validation';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.CLIENT_URL = 'http://localhost:5173';
    process.env.CORS_ORIGINS = 'http://localhost:5173';
    process.env.COOKIE_SECURE = 'false';
    process.env.PLATFORM_SUPPORT_KEY = supportKey;

    ({ default: mongoose } = await import('mongoose'));
    ({ UserModel } = await import('../src/modules/users/user.model.js'));
    ({ ClinicModel } = await import('../src/modules/clinics/clinic.model.js'));
    ({ AuthSessionModel } = await import('../src/modules/auth/auth-session.model.js'));
    ({ PasswordResetTokenModel } = await import('../src/modules/auth/password-reset-token.model.js'));
    ({ AuditLogModel } = await import('../src/modules/audit/audit-log.model.js'));
    ({ generateSync } = await import('otplib'));
    ({ default: bcrypt } = await import('bcryptjs'));
    const { createApp } = await import('../src/app.js');
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all([ClinicModel.syncIndexes(), UserModel.syncIndexes(), AuthSessionModel.syncIndexes(), PasswordResetTokenModel.syncIndexes(), AuditLogModel.syncIndexes()]);
    app = createApp();
  }, 30_000);

  afterAll(async () => {
    if (mongoose?.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }, 30_000);

  it('GET /health and GET /ready report process and database health', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'ready', database: 'connected' });
  });

  it('POST /clinic-signup rejects invalid input without database writes', async () => {
    const before = await Promise.all([ClinicModel.countDocuments(), UserModel.countDocuments(), AuthSessionModel.countDocuments()]);
    const response = await request(app).post('/api/v1/auth/clinic-signup').send({ clinicName: 'A', adminName: '', email: 'bad', password: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await Promise.all([ClinicModel.countDocuments(), UserModel.countDocuments(), AuthSessionModel.countDocuments()])).toEqual(before);
  });

  it('POST /clinic-signup creates clinic, admin, session, audit, and cookie', async () => {
    const response = await request(app).post('/api/v1/auth/clinic-signup').send({ clinicName: `Clinic ${runId}`, adminName: 'API Admin', email: adminEmail, password });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ mfaVerified: false });
    expect(response.body.data).not.toHaveProperty('nextStep');
    adminToken = response.body.data.accessToken;
    adminCookie = cookieValue(response);
    const user = await UserModel.findOne({ email: adminEmail }).select('+passwordHash').lean();
    expect(user).toBeTruthy();
    adminId = String(user?._id);
    clinicId = String(user?.clinicId);
    expect(await bcrypt.compare(password, user?.passwordHash ?? '')).toBe(true);
    expect(await ClinicModel.countDocuments({ _id: clinicId })).toBe(1);
    expect(await AuthSessionModel.countDocuments({ userId: adminId, revokedAt: { $exists: false } })).toBe(1);
    expect(await AuditLogModel.countDocuments({ action: 'clinic.created', targetId: clinicId })).toBe(1);
  });

  it('POST /clinic-signup rejects duplicate identity without orphan clinic', async () => {
    const clinicsBefore = await ClinicModel.countDocuments();
    const response = await request(app).post('/api/v1/auth/clinic-signup').send({ clinicName: 'Duplicate Clinic', adminName: 'Duplicate Admin', email: adminEmail, password });
    expect(response.status).toBe(401);
    expect(await ClinicModel.countDocuments()).toBe(clinicsBefore);
  });

  it('protected endpoints reject missing and invalid access tokens', async () => {
    for (const endpoint of ['/me', '/logout', '/password/change', '/mfa/enroll', '/mfa/challenge', '/mfa/verify', '/staff']) {
      const method = endpoint === '/me' || endpoint === '/staff' ? 'get' : 'post';
      const response = await request(app)[method](`/api/v1/auth${endpoint}`);
      expect(response.status, endpoint).toBe(401);
      expect(response.body.error.code, endpoint).toBe('UNAUTHENTICATED');
    }
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer invalid')).status).toBe(401);
  });

  it('GET /me returns persisted user without selected secrets', async () => {
    const response = await request(app).get('/api/v1/auth/me').set(bearer(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ email: adminEmail, role: 'admin' });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data.user).not.toHaveProperty('mfaSecretEncrypted');
  });

  it('allows the clinic admin to manage staff after password-only authentication', async () => {
    const response = await request(app).get('/api/v1/auth/staff').set(bearer(adminToken));
    expect(response.status).toBe(200);
  });

  it('POST /mfa/enroll validates input and stores only encrypted secret', async () => {
    expect((await request(app).post('/api/v1/auth/mfa/enroll').set(bearer(adminToken)).send({ friendlyName: '' })).status).toBe(400);
    const response = await request(app).post('/api/v1/auth/mfa/enroll').set(bearer(adminToken)).send({ friendlyName: 'Integration phone' });
    expect(response.status).toBe(200);
    mfaSecret = response.body.data.secret;
    const user = await UserModel.findById(adminId).select('+mfaSecretEncrypted').lean();
    expect(user?.mfaSecretEncrypted).toBeTruthy();
    expect(user?.mfaSecretEncrypted).not.toContain(mfaSecret);
    expect(user?.mfaEnrolled).toBe(false);
  });

  it('POST /mfa/challenge persists challenge and /mfa/verify rejects bad code without enrollment', async () => {
    expect((await request(app).post('/api/v1/auth/mfa/challenge').set(bearer(adminToken)).send({ unexpected: true })).status).toBe(200);
    const challenge = await request(app).post('/api/v1/auth/mfa/challenge').set(bearer(adminToken)).send({});
    expect(challenge.status).toBe(200);
    const session = await AuthSessionModel.findOne({ userId: adminId, revokedAt: { $exists: false } }).select('+mfaChallengeHash').lean();
    expect(session?.mfaChallengeHash).toBeTruthy();
    const invalid = await request(app).post('/api/v1/auth/mfa/verify').set(bearer(adminToken)).send({ challengeId: challenge.body.data.challengeId, code: '000000' });
    expect(invalid.status).toBe(401);
    expect((await UserModel.findById(adminId).lean())?.mfaEnrolled).toBe(false);
  });

  it('POST /mfa/verify enrolls MFA, rotates session, and creates recovery codes/audit', async () => {
    const challenge = await request(app).post('/api/v1/auth/mfa/challenge').set(bearer(adminToken)).send({});
    const code = generateSync({ secret: mfaSecret });
    const response = await request(app).post('/api/v1/auth/mfa/verify').set(bearer(adminToken)).send({ challengeId: challenge.body.data.challengeId, code });
    expect(response.status).toBe(200);
    expect(response.body.data.recoveryCodes).toHaveLength(10);
    adminToken = response.body.data.accessToken;
    adminCookie = cookieValue(response);
    const user = await UserModel.findById(adminId).select('+mfaRecoveryCodesHash').lean();
    expect(user?.mfaEnrolled).toBe(true);
    expect(user?.mfaRecoveryCodesHash).toHaveLength(10);
    expect(await AuthSessionModel.countDocuments({ userId: adminId, revokedAt: { $exists: false }, mfaVerifiedAt: { $exists: true } })).toBe(1);
    expect(await AuditLogModel.countDocuments({ action: 'auth.mfa_verified', targetId: adminId })).toBe(1);
  });

  it('POST /staff validates and creates staff; GET /staff returns persisted records', async () => {
    const before = await UserModel.countDocuments({ clinicId });
    expect((await request(app).post('/api/v1/auth/staff').set(bearer(adminToken)).send({ name: 'X', email: 'bad', role: 'admin', temporaryPassword: 'short' })).status).toBe(400);
    expect(await UserModel.countDocuments({ clinicId })).toBe(before);
    const created = await request(app).post('/api/v1/auth/staff').set(bearer(adminToken)).send({ name: 'API Doctor', email: staffEmail, role: 'doctor', temporaryPassword: staffPassword });
    expect(created.status).toBe(201);
    const staff = await UserModel.findOne({ email: staffEmail }).select('+passwordHash').lean();
    staffId = String(staff?._id);
    expect(staff).toMatchObject({ role: 'doctor', mustChangePassword: true, status: 'active' });
    expect(await bcrypt.compare(staffPassword, staff?.passwordHash ?? '')).toBe(true);
    expect(await AuditLogModel.countDocuments({ action: 'staff.created', targetId: staffId })).toBe(1);
    const listed = await request(app).get('/api/v1/auth/staff').set(bearer(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.staff.some((item: { email: string }) => item.email === staffEmail)).toBe(true);
    expect(listed.body.data.staff.every((item: Record<string, unknown>) => !('passwordHash' in item))).toBe(true);
    expect(listed.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('completes a temporary-password first login without requiring the old password twice', async () => {
    resetFactorySequence();
    const fixture = buildReceptionist({ clinicId, email: `first-sign-in-${runId}@example.test` });
    const created = await request(app).post('/api/v1/auth/staff').set(bearer(adminToken)).send({
      name: fixture.name,
      email: fixture.email,
      role: fixture.role,
      temporaryPassword: FACTORY_PASSWORD,
    });
    expect(created.status).toBe(201);

    const firstLogin = await request(app).post('/api/v1/auth/login').send({ email: fixture.email, password: FACTORY_PASSWORD });
    expect(firstLogin.status).toBe(200);
    expect(firstLogin.body.data.mustChangePassword).toBe(true);

    const completed = await request(app)
      .post('/api/v1/auth/password/complete-first-sign-in')
      .set(bearer(firstLogin.body.data.accessToken))
      .send({ newPassword: 'FirstSignInChanged!456' });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toEqual({ passwordChanged: true, requiresLogin: true });
    expect((await request(app).get('/api/v1/auth/me').set(bearer(firstLogin.body.data.accessToken))).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: fixture.email, password: 'FirstSignInChanged!456' })).status).toBe(200);
  });

  it('POST disable and enable update status, session version, and audit state', async () => {
    const activeSession = await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: staffPassword });
    const initial = await UserModel.findById(staffId).lean();
    const disabled = await request(app).post(`/api/v1/auth/staff/${staffId}/disable`).set(bearer(adminToken));
    expect(disabled.status).toBe(200);
    const afterDisable = await UserModel.findById(staffId).lean();
    expect(afterDisable?.status).toBe('disabled');
    expect(afterDisable?.sessionVersion).toBe((initial?.sessionVersion ?? 0) + 1);
    const forcedLogout = await request(app).get('/api/v1/auth/me').set(bearer(activeSession.body.data.accessToken));
    expect(forcedLogout.status).toBe(401);
    expect(forcedLogout.body.error.code).toBe('ACCOUNT_DISABLED');
    expect((await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: staffPassword })).status).toBe(401);
    const enabledResponse = await request(app).post(`/api/v1/auth/staff/${staffId}/enable`).set(bearer(adminToken));
    expect(enabledResponse.status).toBe(200);
    expect((await UserModel.findById(staffId).lean())?.status).toBe('active');
    expect(await AuditLogModel.countDocuments({ targetId: staffId, action: { $in: ['staff.disabled', 'staff.active'] } })).toBe(2);
  });

  it('POST reset-password hashes replacement, revokes sessions, and forces password change', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: staffPassword });
    expect(login.status).toBe(200);
    const oldStaffToken = login.body.data.accessToken;
    expect((await request(app).get('/api/v1/auth/staff').set(bearer(oldStaffToken))).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const reset = await request(app).post(`/api/v1/auth/staff/${staffId}/reset-password`).set(bearer(adminToken)).send({ temporaryPassword: resetPassword });
    expect(reset.status).toBe(200);
    const user = await UserModel.findById(staffId).select('+passwordHash').lean();
    expect(user?.mustChangePassword).toBe(true);
    expect(await bcrypt.compare(resetPassword, user?.passwordHash ?? '')).toBe(true);
    expect((await request(app).get('/api/v1/auth/me').set(bearer(oldStaffToken))).status).toBe(401);
    expect(await AuthSessionModel.countDocuments({ userId: staffId, revokedAt: { $exists: false } })).toBe(0);
  });

  it('POST /login rejects malformed/wrong credentials and succeeds with persisted state changes', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'bad', password: '' })).status).toBe(400);
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: 'WrongPassword!123' });
    expect(wrong.status).toBe(401);
    expect((await UserModel.findById(staffId).lean())?.failedLoginCount).toBe(1);
    expect(await AuditLogModel.countDocuments({ action: 'auth.login_failed', targetId: staffId })).toBeGreaterThan(0);
    const login = await request(app).post('/api/v1/auth/login').send({ email: staffEmail.toUpperCase(), password: resetPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.mustChangePassword).toBe(true);
    expect((await UserModel.findById(staffId).lean())?.failedLoginCount).toBe(0);
  });

  it('POST /password/change verifies current password, updates hash, revokes sessions, and permits new login', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: resetPassword });
    const staffToken = login.body.data.accessToken;
    const wrong = await request(app).post('/api/v1/auth/password/change').set(bearer(staffToken)).send({ currentPassword: 'WrongPassword!123', newPassword: changedPassword });
    expect(wrong.status).toBe(401);
    const changed = await request(app).post('/api/v1/auth/password/change').set(bearer(staffToken)).send({ currentPassword: resetPassword, newPassword: changedPassword });
    expect(changed.status).toBe(200);
    const user = await UserModel.findById(staffId).select('+passwordHash').lean();
    expect(user?.mustChangePassword).toBe(false);
    expect(await bcrypt.compare(changedPassword, user?.passwordHash ?? '')).toBe(true);
    expect(await AuthSessionModel.countDocuments({ userId: staffId, revokedAt: { $exists: false } })).toBe(0);
    const relogin = await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: changedPassword });
    expect(relogin.status).toBe(200);
    const forbidden = await request(app).get('/api/v1/auth/staff').set(bearer(relogin.body.data.accessToken));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('requests a short-lived hashed reset token without exposing account existence', async () => {
    const resetSubject = await UserModel.create({ clinicId, email: resetSubjectEmail, name: 'Reset Subject', passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
    resetSubjectId = String(resetSubject._id);
    const unknown = await request(app).post('/api/v1/auth/password/forgot').send({ email: `unknown-${runId}@example.test` });
    expect(unknown.status).toBe(202);
    expect(unknown.body.data).toEqual({ accepted: true });

    const requested = await request(app).post('/api/v1/auth/password/forgot').send({ email: resetSubjectEmail });
    expect(requested.status).toBe(202);
    expect(requested.body.data.accepted).toBe(true);
    expect(requested.body.data.developmentResetUrl).toMatch(/^http:\/\/localhost:5173\/reset-password\?token=/);
    const rawToken = new URL(requested.body.data.developmentResetUrl).searchParams.get('token');
    expect(rawToken).toBeTruthy();

    const persisted = await PasswordResetTokenModel.findOne({ userId: resetSubjectId }).select('+tokenHash').lean();
    expect(persisted?.tokenHash).toMatch(/^[a-f\d]{64}$/);
    expect(persisted?.tokenHash).not.toBe(rawToken);
    expect(persisted?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(persisted?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
    expect(await AuditLogModel.countDocuments({ action: 'auth.password_reset_requested', targetId: resetSubjectId })).toBe(1);
  });

  it('consumes reset tokens once, revokes all sessions, and audits without token material', async () => {
    const activeLogin = await request(app).post('/api/v1/auth/login').send({ email: resetSubjectEmail, password });
    const requestReset = await request(app).post('/api/v1/auth/password/forgot').send({ email: resetSubjectEmail });
    const resetToken = new URL(requestReset.body.data.developmentResetUrl).searchParams.get('token');
    const replacement = 'ForgottenPassword!456';
    const completed = await request(app).post('/api/v1/auth/password/reset').send({ token: resetToken, newPassword: replacement });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toEqual({ passwordReset: true, loginPath: '/login' });
    expect((await request(app).get('/api/v1/auth/me').set(bearer(activeLogin.body.data.accessToken))).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: resetSubjectEmail, password })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: resetSubjectEmail, password: replacement })).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token: resetToken, newPassword: 'AnotherPassword!789' })).body.error.code).toBe('RESET_TOKEN_INVALID');
    const audit = await AuditLogModel.findOne({ action: 'auth.password_reset_completed', targetId: resetSubjectId }).lean();
    expect(JSON.stringify(audit?.metadata ?? {})).not.toContain(resetToken);
  });

  it('rejects expired reset tokens and invalidates an older token when another is requested', async () => {
    const first = await request(app).post('/api/v1/auth/password/forgot').send({ email: staffEmail });
    const firstToken = new URL(first.body.data.developmentResetUrl).searchParams.get('token');
    const second = await request(app).post('/api/v1/auth/password/forgot').send({ email: staffEmail });
    const secondToken = new URL(second.body.data.developmentResetUrl).searchParams.get('token');
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token: firstToken, newPassword: 'UnusedPassword!456' })).body.error.code).toBe('RESET_TOKEN_INVALID');
    await PasswordResetTokenModel.findOneAndUpdate(
      { userId: staffId, usedAt: { $exists: false }, invalidatedAt: { $exists: false } },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
      { sort: { createdAt: -1 } },
    );
    expect((await request(app).post('/api/v1/auth/password/reset').send({ token: secondToken, newPassword: 'ExpiredPassword!456' })).body.error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('declares unique reset-token lookup and expiry cleanup indexes', () => {
    const indexes = PasswordResetTokenModel.schema.indexes();
    expect(indexes).toContainEqual([{ tokenHash: 1 }, expect.objectContaining({ unique: true })]);
    expect(indexes).toContainEqual([{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })]);
  });

  it('POST /refresh rejects missing token and rotates valid cookie/session', async () => {
    expect((await request(app).post('/api/v1/auth/refresh')).body.error.code).toBe('SESSION_EXPIRED');
    const oldCookie = adminCookie;
    const activeBefore = await AuthSessionModel.countDocuments({ userId: adminId, revokedAt: { $exists: false } });
    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(refreshed.status).toBe(200);
    adminToken = refreshed.body.data.accessToken;
    adminCookie = cookieValue(refreshed);
    expect(adminCookie).not.toBe(oldCookie);
    expect(await AuthSessionModel.countDocuments({ userId: adminId, revokedAt: { $exists: false } })).toBe(activeBefore);
    expect(await AuthSessionModel.countDocuments({ userId: adminId, revokedAt: { $exists: true } })).toBeGreaterThan(0);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie)).status).toBe(401);
  });

  it('POST /mfa/recover validates support authorization and clears MFA/session state', async () => {
    const invalid = await request(app).post('/api/v1/auth/mfa/recover').set('x-platform-support-key', 'wrong-key-that-is-long-enough-000').send({ userId: adminId, reason: 'Integration recovery verification' });
    expect(invalid.status).toBe(403);
    expect((await UserModel.findById(adminId).lean())?.mfaEnrolled).toBe(true);
    const recovered = await request(app).post('/api/v1/auth/mfa/recover').set('x-platform-support-key', supportKey).send({ userId: adminId, reason: 'Integration recovery verification' });
    expect(recovered.status).toBe(200);
    const user = await UserModel.findById(adminId).select('+mfaSecretEncrypted +mfaRecoveryCodesHash').lean();
    expect(user?.mfaEnrolled).toBe(false);
    expect(user?.mfaSecretEncrypted).toBeUndefined();
    expect(user?.mfaRecoveryCodesHash).toHaveLength(0);
    expect(await AuthSessionModel.countDocuments({ userId: adminId, revokedAt: { $exists: false } })).toBe(0);
    expect((await request(app).get('/api/v1/auth/me').set(bearer(adminToken))).status).toBe(401);
    expect(await AuditLogModel.countDocuments({ action: 'auth.mfa_recovered', targetId: adminId })).toBe(1);
  });

  it('POST /logout revokes persisted sessions, invalidates token, and audits action', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: changedPassword });
    const token = login.body.data.accessToken;
    const response = await request(app).post('/api/v1/auth/logout').set(bearer(token));
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeTruthy();
    expect(await AuthSessionModel.countDocuments({ userId: staffId, revokedAt: { $exists: false } })).toBe(0);
    expect((await request(app).get('/api/v1/auth/me').set(bearer(token))).status).toBe(401);
    expect(await AuditLogModel.countDocuments({ action: 'auth.logout', targetId: staffId })).toBe(1);
  });

  it('staff mutations cannot target a user belonging to another clinic', async () => {
    const signup = await request(app).post('/api/v1/auth/clinic-signup').send({ clinicName: `Other ${runId}`, adminName: 'Other Admin', email: secondAdminEmail, password });
    const otherAdminId = String((await UserModel.findOne({ email: secondAdminEmail }).lean())?._id);
    expect(signup.status).toBe(201);
    const currentAdminLogin = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password });
    const currentToken = currentAdminLogin.body.data.accessToken;
    await UserModel.updateOne({ _id: adminId }, { $set: { mfaEnrolled: true } });
    const claims = (await import('../src/shared/jwt.js')).verifyAccessToken(currentToken);
    const mfaToken = (await import('../src/shared/jwt.js')).signAccessToken({
      userId: claims.userId,
      clinicId: claims.clinicId,
      role: claims.role,
      sessionVersion: claims.sessionVersion,
      sessionId: claims.sessionId,
      mfaVerified: true,
    });
    const response = await request(app).post(`/api/v1/auth/staff/${otherAdminId}/disable`).set(bearer(mfaToken));
    expect(response.status).toBe(404);
    expect((await UserModel.findById(otherAdminId).lean())?.status).toBe('active');
  });

  it('returns structured JSON errors for unknown routes, malformed JSON, and oversized JSON', async () => {
    const missing = await request(app).get('/api/v1/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.type).toMatch(/json/);
    expect(missing.body.error.code).toBe('NOT_FOUND');

    const malformed = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('MALFORMED_JSON');

    const oversized = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: `large-${runId}@example.test`, password: 'x'.repeat(11_000) }));
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns validation errors rather than 500 for malformed staff path identifiers', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password });
    const claims = (await import('../src/shared/jwt.js')).verifyAccessToken(login.body.data.accessToken);
    const token = (await import('../src/shared/jwt.js')).signAccessToken({
      userId: claims.userId,
      clinicId: claims.clinicId,
      role: claims.role,
      sessionVersion: claims.sessionVersion,
      sessionId: claims.sessionId,
      mfaVerified: true,
    });
    for (const suffix of ['disable', 'enable']) {
      const response = await request(app).post(`/api/v1/auth/staff/not-an-object-id/${suffix}`).set(bearer(token));
      expect(response.status, suffix).toBe(400);
      expect(response.body.error.code, suffix).toBe('VALIDATION_ERROR');
    }
    const reset = await request(app).post('/api/v1/auth/staff/not-an-object-id/reset-password').set(bearer(token)).send({ temporaryPassword: resetPassword });
    expect(reset.status).toBe(400);
    expect(reset.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('detects refresh-token replay and revokes the replacement session', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password });
    const oldCookie = cookieValue(login);
    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(rotated.status).toBe(200);
    const replacementCookie = cookieValue(rotated);
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_REUSED');
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', replacementCookie)).status).toBe(401);
    expect(await AuthSessionModel.countDocuments({ userId: adminId, revokedAt: { $exists: false } })).toBe(0);
  });

  it('distinguishes idle and absolutely expired refresh sessions without mutating them', async () => {
    const idleLogin = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password });
    const idleCookie = cookieValue(idleLogin);
    const idleSession = await AuthSessionModel.findOne({ userId: adminId, revokedAt: { $exists: false } });
    expect(idleSession).toBeTruthy();
    await AuthSessionModel.updateOne({ _id: idleSession?._id }, { $set: { lastActivityAt: new Date(Date.now() - 16 * 60 * 1000) } });
    const idle = await request(app).post('/api/v1/auth/refresh').set('Cookie', idleCookie);
    expect(idle.status).toBe(401);
    expect(idle.body.error.code).toBe('SESSION_IDLE');
    expect((await AuthSessionModel.findById(idleSession?._id).lean())?.revokedAt).toBeUndefined();

    const expiredLogin = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password });
    const expiredCookie = cookieValue(expiredLogin);
    const expiredSession = await AuthSessionModel.findOne({ userId: adminId, revokedAt: { $exists: false } });
    await AuthSessionModel.updateOne({ _id: expiredSession?._id }, { $set: { expiresAt: new Date(Date.now() - 1_000) } });
    const expired = await request(app).post('/api/v1/auth/refresh').set('Cookie', expiredCookie);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('locks an account after repeated failures and blocks a previously valid token', async () => {
    const lockEmail = `lock-${runId}@example.test`;
    const lockUser = await UserModel.create({ clinicId, email: lockEmail, name: 'Lock Test', passwordHash: await bcrypt.hash(password, 12), role: 'doctor' });
    const initialLogin = await request(app).post('/api/v1/auth/login').send({ email: lockEmail, password });
    expect(initialLogin.status).toBe(200);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const failed = await request(app).post('/api/v1/auth/login').send({ email: lockEmail, password: 'IncorrectPassword!999' });
      expect(failed.status, `attempt ${attempt}`).toBe(401);
    }
    const persisted = await UserModel.findById(lockUser._id).lean();
    expect(persisted?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(persisted?.failedLoginCount).toBe(0);
    const protectedResponse = await request(app).get('/api/v1/auth/me').set(bearer(initialLogin.body.data.accessToken));
    expect(protectedResponse.status).toBe(423);
    expect(protectedResponse.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(await AuditLogModel.countDocuments({ action: 'auth.login_failed', targetId: String(lockUser._id) })).toBe(5);
  });

  it('blocks login and existing sessions when the owning clinic is suspended', async () => {
    const suspendedClinic = await ClinicModel.create({ name: `Suspended ${runId}`, email: `suspended-clinic-${runId}@example.test` });
    const suspendedEmail = `suspended-user-${runId}@example.test`;
    const suspendedUser = await UserModel.create({ clinicId: suspendedClinic._id, email: suspendedEmail, name: 'Suspended User', passwordHash: await bcrypt.hash(password, 12), role: 'doctor' });
    const login = await request(app).post('/api/v1/auth/login').send({ email: suspendedEmail, password });
    expect(login.status).toBe(200);
    await ClinicModel.updateOne({ _id: suspendedClinic._id }, { $set: { status: 'suspended' } });
    const relogin = await request(app).post('/api/v1/auth/login').send({ email: suspendedEmail, password });
    expect(relogin.status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set(bearer(login.body.data.accessToken))).status).toBe(401);
    expect(await AuthSessionModel.countDocuments({ userId: suspendedUser._id, revokedAt: { $exists: false } })).toBe(0);
  });

  it('prevents staff-management routes from mutating administrator accounts', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: adminEmail, password });
    const claims = (await import('../src/shared/jwt.js')).verifyAccessToken(login.body.data.accessToken);
    const token = (await import('../src/shared/jwt.js')).signAccessToken({
      userId: claims.userId,
      clinicId: claims.clinicId,
      role: claims.role,
      sessionVersion: claims.sessionVersion,
      sessionId: claims.sessionId,
      mfaVerified: true,
    });
    const peerAdmin = await UserModel.create({ clinicId, email: `peer-admin-${runId}@example.test`, name: 'Peer Admin', passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
    for (const target of [adminId, String(peerAdmin._id)]) {
      const disabled = await request(app).post(`/api/v1/auth/staff/${target}/disable`).set(bearer(token));
      expect(disabled.status, target).toBe(403);
      const reset = await request(app).post(`/api/v1/auth/staff/${target}/reset-password`).set(bearer(token)).send({ temporaryPassword: resetPassword });
      expect(reset.status, target).toBe(403);
      expect((await UserModel.findById(target).lean())?.status).toBe('active');
    }
  });

  it('handles concurrent duplicate signup without 500s or orphan records', async () => {
    const email = `concurrent-${runId}@example.test`;
    const body = { clinicName: `Concurrent ${runId}`, adminName: 'Concurrent Admin', email, password };
    const responses = await Promise.all([
      request(app).post('/api/v1/auth/clinic-signup').send(body),
      request(app).post('/api/v1/auth/clinic-signup').send(body),
    ]);
    expect(responses.map((item) => item.status).sort()).toEqual([201, 401]);
    expect(await UserModel.countDocuments({ email })).toBe(1);
    expect(await ClinicModel.countDocuments({ email })).toBe(1);
  });

  it('sets hardened refresh-cookie attributes and omits CORS approval for disallowed origins', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email: staffEmail, password: changedPassword });
    const setCookie = (Array.isArray(login.headers['set-cookie']) ? login.headers['set-cookie'][0] : login.headers['set-cookie']) ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/api/v1/auth');
    expect(setCookie).toMatch(/Max-Age=/);
    const cors = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(cors.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits repeated login attempts with the documented JSON error', async () => {
    const email = `limiter-${runId}@example.test`;
    let response: request.Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(app).post('/api/v1/auth/login').send({ email, password: 'IncorrectPassword!999' });
    }
    expect(response?.status).toBe(429);
    expect(response?.body.error.code).toBe('RATE_LIMITED');
    expect(response?.headers['ratelimit-reset']).toBeTruthy();
  });
});
