import crypto from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabaseUri } from './support/database.js';

describe('clinic-scoped WhatsApp communications', () => {
  let app: import('express').Express;
  let mongoose: typeof import('mongoose').default;
  let ClinicModel: typeof import('../src/modules/clinics/clinic.model.js').ClinicModel;
  let UserModel: typeof import('../src/modules/users/user.model.js').UserModel;
  let PatientModel: typeof import('../src/modules/patients/patient.model.js').PatientModel;
  let AuthSessionModel: typeof import('../src/modules/auth/auth-session.model.js').AuthSessionModel;
  let CommunicationMessageModel: typeof import('../src/modules/communications/communication-message.model.js').CommunicationMessageModel;
  let WebhookEventModel: typeof import('../src/modules/communications/webhook-event.model.js').WebhookEventModel;
  let signAccessToken: typeof import('../src/shared/jwt.js').signAccessToken;
  let bcrypt: typeof import('bcryptjs').default;
  let clinicId = '';
  let patientId = '';
  let adminToken = '';
  let receptionistToken = '';
  let otherClinicReceptionistToken = '';
  const webhookKey = 'clinic-webhook-key-1234567890';
  const appSecret = 'meta-app-secret-for-tests';
  const verifyToken = 'meta-verify-token-for-tests';

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.MONGODB_URI = isolatedDatabaseUri(process.env.MONGODB_URI ?? '', 'whatsapp');
    ({ default: mongoose } = await import('mongoose'));
    ({ ClinicModel } = await import('../src/modules/clinics/clinic.model.js'));
    ({ UserModel } = await import('../src/modules/users/user.model.js'));
    ({ PatientModel } = await import('../src/modules/patients/patient.model.js'));
    ({ AuthSessionModel } = await import('../src/modules/auth/auth-session.model.js'));
    ({ CommunicationMessageModel } = await import('../src/modules/communications/communication-message.model.js'));
    ({ WebhookEventModel } = await import('../src/modules/communications/webhook-event.model.js'));
    ({ signAccessToken } = await import('../src/shared/jwt.js'));
    ({ default: bcrypt } = await import('bcryptjs'));
    const { createApp } = await import('../src/app.js');
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    app = createApp();
    const clinic = await ClinicModel.create({ name: 'Messaging Clinic', email: 'messaging@example.test' });
    clinicId = String(clinic._id);
    const passwordHash = await bcrypt.hash('ValidPassword!123', 4);
    const [admin, doctor, receptionist] = await UserModel.create([
      { clinicId, name: 'Admin', email: 'admin-messaging@example.test', passwordHash, role: 'admin' },
      { clinicId, name: 'Doctor', email: 'doctor-messaging@example.test', passwordHash, role: 'doctor' },
      { clinicId, name: 'Reception', email: 'reception-messaging@example.test', passwordHash, role: 'receptionist' },
    ]);
    if (!admin || !doctor || !receptionist) throw new Error('Expected users');
    const patient = await PatientModel.create({ clinicId, assignedDoctorId: doctor._id, registeredById: receptionist._id, name: 'Priya Mehta', normalizedName: 'priya mehta', phone: '+919876543210', age: 34, gender: 'female' });
    patientId = String(patient._id);
    const issue = async (user: typeof admin) => {
      const userClinicId = String(user.clinicId);
      const sessionId = crypto.randomUUID();
      await AuthSessionModel.create({ userId: user._id, clinicId: userClinicId, sessionId, refreshTokenHash: await bcrypt.hash(crypto.randomUUID(), 4), issuedAt: new Date(), lastActivityAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) });
      return signAccessToken({ userId: String(user._id), clinicId: userClinicId, role: user.role, sessionVersion: user.sessionVersion, sessionId, mfaVerified: false });
    };
    adminToken = await issue(admin);
    receptionistToken = await issue(receptionist);
    const otherClinic = await ClinicModel.create({ name: 'Other Clinic', email: 'other-messaging@example.test' });
    const otherReceptionist = await UserModel.create({ clinicId: otherClinic._id, name: 'Other Reception', email: 'other-reception@example.test', passwordHash, role: 'receptionist' });
    otherClinicReceptionistToken = await issue(otherReceptionist);
  }, 30_000);

  afterAll(async () => { if (mongoose?.connection.readyState === 1) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } }, 30_000);

  it('stores clinic configuration secrets write-only and restricts configuration to admins', async () => {
    const denied = await request(app).patch('/api/v1/clinic/me/whatsapp-config').set(bearer(receptionistToken)).send({ adapter: 'sandbox' });
    expect(denied.status).toBe(403);
    const response = await request(app).patch('/api/v1/clinic/me/whatsapp-config').set(bearer(adminToken)).send({ adapter: 'cloud', apiVersion: 'v26.0', phoneNumberId: '106540352242922', whatsappBusinessAccountId: '102290129340398', accessToken: 'permanent-system-user-token', appSecret, verifyToken, webhookKey });
    expect(response.status).toBe(200);
    expect(response.body.data.whatsapp).toMatchObject({ adapter: 'cloud', apiVersion: 'v26.0', phoneNumberId: '106540352242922', isConfigured: true });
    expect(JSON.stringify(response.body)).not.toContain('permanent-system-user-token');
    expect(JSON.stringify(response.body)).not.toContain(appSecret);
    expect(JSON.stringify(response.body)).not.toContain(verifyToken);
  });

  it('captures explicit patient consent and only lets admins register Meta-approved templates', async () => {
    const consent = await request(app).patch(`/api/v1/patients/${patientId}/communication-consent`).set(bearer(receptionistToken)).send({ status: 'opted_in', source: 'in_person', categories: ['appointments', 'prescription_ready'] });
    expect(consent.status).toBe(200);
    expect(consent.body.data.consent.status).toBe('opted_in');
    const denied = await request(app).post('/api/v1/communications/templates').set(bearer(receptionistToken)).send({ name: 'appointment_confirmation', language: 'en_US', category: 'utility', purpose: 'appointment_confirmation', status: 'APPROVED', parameterFormat: 'named', parameterNames: ['patient_name', 'appointment_time'] });
    expect(denied.status).toBe(403);
    const approved = await request(app).post('/api/v1/communications/templates').set(bearer(adminToken)).send({ name: 'appointment_confirmation', language: 'en_US', category: 'utility', purpose: 'appointment_confirmation', status: 'APPROVED', parameterFormat: 'named', parameterNames: ['patient_name', 'appointment_time'] });
    expect(approved.status).toBe(201);
  });

  it('rejects invalid webhook signatures and processes delivery events idempotently', async () => {
    const message = await CommunicationMessageModel.create({ clinicId, patientId, direction: 'outbound', purpose: 'appointment_confirmation', channel: 'whatsapp', templateName: 'appointment_confirmation', status: 'accepted', providerMessageId: 'wamid.delivery-test', timeline: [{ status: 'accepted', at: new Date() }] });
    const payload = { object: 'whatsapp_business_account', entry: [{ id: '102290129340398', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '106540352242922' }, statuses: [{ id: 'wamid.delivery-test', status: 'delivered', timestamp: '1785671000', recipient_id: '919876543210' }] } }] }] };
    const raw = JSON.stringify(payload);
    const invalid = await request(app).post(`/api/v1/webhooks/whatsapp/${webhookKey}`).set('content-type', 'application/json').set('x-hub-signature-256', 'sha256=deadbeef').send(raw);
    expect(invalid.status).toBe(401);
    const signature = `sha256=${crypto.createHmac('sha256', appSecret).update(raw).digest('hex')}`;
    const first = await request(app).post(`/api/v1/webhooks/whatsapp/${webhookKey}`).set('content-type', 'application/json').set('x-hub-signature-256', signature).send(raw);
    const duplicate = await request(app).post(`/api/v1/webhooks/whatsapp/${webhookKey}`).set('content-type', 'application/json').set('x-hub-signature-256', signature).send(raw);
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(await WebhookEventModel.countDocuments({ clinicId })).toBe(1);
    expect((await CommunicationMessageModel.findById(message._id).lean())?.status).toBe('delivered');
  });

  it('verifies callback challenges and records patient replies with reception alerts', async () => {
    const challenge = await request(app).get(`/api/v1/webhooks/whatsapp/${webhookKey}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': verifyToken, 'hub.challenge': '1158201444' });
    expect(challenge.status).toBe(200);
    expect(challenge.text).toBe('1158201444');
    const payload = { object: 'whatsapp_business_account', entry: [{ id: '102290129340398', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '106540352242922' }, messages: [{ from: '919876543210', id: 'wamid.reply-test', timestamp: '1785671100', type: 'text', text: { body: 'CONFIRM' } }] } }] }] };
    const raw = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', appSecret).update(raw).digest('hex')}`;
    expect((await request(app).post(`/api/v1/webhooks/whatsapp/${webhookKey}`).set('content-type', 'application/json').set('x-hub-signature-256', signature).send(raw)).status).toBe(200);
    const timeline = await request(app).get(`/api/v1/communications/patients/${patientId}/timeline`).set(bearer(receptionistToken));
    expect(timeline.status).toBe(200);
    expect(timeline.body.data.messages.some((item: { status: string; replyText?: string }) => item.status === 'replied' && item.replyText === 'CONFIRM')).toBe(true);
    const crossClinicTimeline = await request(app).get(`/api/v1/communications/patients/${patientId}/timeline`).set(bearer(otherClinicReceptionistToken));
    expect(crossClinicTimeline.status).toBe(404);
    const alerts = await request(app).get('/api/v1/communications/alerts').set(bearer(receptionistToken));
    expect(alerts.body.data.alerts.some((item: { type: string }) => item.type === 'patient_reply')).toBe(true);
  });
});
