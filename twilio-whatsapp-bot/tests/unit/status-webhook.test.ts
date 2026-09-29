import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { messageStatusStore } from '../../src/twilio/message-status.store.js';

describe('Twilio Outbound Status Webhook (PROMPT 15)', () => {
  const app = createApp();

  beforeEach(() => {
    messageStatusStore.clear();
  });

  it('records delivery status transition queued -> sent -> delivered -> read', async () => {
    const messageSid = 'SM1234567890abcdef1234567890abcdef';

    // 1. Sent status
    const sentRes = await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({
        MessageSid: messageSid,
        MessageStatus: 'sent',
        To: 'whatsapp:+919876543210',
        From: 'whatsapp:+14155238886',
      });

    expect(sentRes.status).toBe(200);
    expect(sentRes.body.success).toBe(true);
    expect(sentRes.body.status).toBe('sent');

    // 2. Delivered status
    const delivRes = await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({
        MessageSid: messageSid,
        MessageStatus: 'delivered',
        To: 'whatsapp:+919876543210',
        From: 'whatsapp:+14155238886',
      });

    expect(delivRes.status).toBe(200);
    expect(delivRes.body.status).toBe('delivered');

    // 3. Read status
    const readRes = await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({
        MessageSid: messageSid,
        MessageStatus: 'read',
        To: 'whatsapp:+919876543210',
        From: 'whatsapp:+14155238886',
      });

    expect(readRes.status).toBe(200);
    expect(readRes.body.status).toBe('read');

    const record = messageStatusStore.getRecord(messageSid);
    expect(record).toBeDefined();
    expect(record?.currentStatus).toBe('read');
    expect(record?.timeline.map((t) => t.status)).toEqual(['sent', 'delivered', 'read']);
  });

  it('records failed delivery status with error codes', async () => {
    const messageSid = 'SMfailed1234567890abcdef123456789';

    const failRes = await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({
        MessageSid: messageSid,
        MessageStatus: 'failed',
        ErrorCode: '30008',
        ErrorMessage: 'Unknown error',
        To: 'whatsapp:+919876543210',
      });

    expect(failRes.status).toBe(200);
    expect(failRes.body.status).toBe('failed');

    const record = messageStatusStore.getRecord(messageSid);
    expect(record?.currentStatus).toBe('failed');
    expect(record?.errorCode).toBe('30008');
  });

  it('handles duplicate webhook status callbacks idempotently without timeline duplication', async () => {
    const messageSid = 'SMidempotent1234567890abcdef123';

    // First delivery callback
    await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({ MessageSid: messageSid, MessageStatus: 'delivered' });

    // Second duplicate delivery callback
    await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({ MessageSid: messageSid, MessageStatus: 'delivered' });

    const record = messageStatusStore.getRecord(messageSid);
    expect(record?.timeline.length).toBe(1);
    expect(record?.timeline[0].status).toBe('delivered');
  });

  it('records undelivered status cleanly', async () => {
    const messageSid = 'SMundelivered1234567890abcdef';

    const res = await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({ MessageSid: messageSid, MessageStatus: 'undelivered', ErrorCode: '30003' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('undelivered');

    const record = messageStatusStore.getRecord(messageSid);
    expect(record?.currentStatus).toBe('undelivered');
  });

  it('rejects status callback without MessageSid with 400', async () => {
    const res = await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'pass')
      .type('form')
      .send({
        MessageStatus: 'delivered',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('MISSING_MESSAGESID');
  });

  it('rejects invalid signature when test bypass header is invalid', async () => {
    const res = await request(app)
      .post('/webhooks/twilio/status')
      .set('x-test-bypass-signature', 'invalid')
      .type('form')
      .send({
        MessageSid: 'SM123',
        MessageStatus: 'sent',
      });

    expect(res.status).toBe(403);
  });
});
