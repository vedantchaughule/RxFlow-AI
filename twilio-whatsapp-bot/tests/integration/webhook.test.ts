import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Twilio Webhooks Integration (PROMPT 01)', () => {
  const app = createApp();

  it('POST /webhooks/twilio/whatsapp processes inbound message', async () => {
    const res = await request(app)
      .post('/webhooks/twilio/whatsapp')
      .type('form')
      .send({
        MessageSid: 'SM_test_123',
        From: 'whatsapp:+919876543210',
        Body: 'Hi',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
    expect(res.text).toContain('<Response>');
    expect(res.text).toContain('<Message>');
  });

  it('POST /webhooks/twilio/status accepts status updates', async () => {
    const res = await request(app)
      .post('/webhooks/twilio/status')
      .type('form')
      .send({
        MessageSid: 'SM_test_123',
        MessageStatus: 'delivered',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('delivered');
  });
});
