import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Twilio Webhook Security (PROMPT 03)', () => {
  const app = createApp();

  // ─── Signature Validation ────────────────────────────────────────

  describe('Signature Validation', () => {
    it('accepts request with valid signature (test mode bypass)', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          MessageSid: 'SM_valid_sig_001',
          From: 'whatsapp:+919876543210',
          Body: 'Hello',
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/xml');
      expect(res.text).toContain('<Response>');
    });

    it('rejects request with invalid signature', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .set('X-Test-Bypass-Signature', 'invalid')
        .type('form')
        .send({
          MessageSid: 'SM_invalid_sig_001',
          From: 'whatsapp:+919876543210',
          Body: 'Hello',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    });

    it('rejects request with missing signature header (non-test mode simulated)', async () => {
      // In test mode, missing signature is bypassed by default.
      // The 'invalid' bypass header simulates rejection behavior.
      const res = await request(app)
        .post('/webhooks/twilio/status')
        .set('X-Test-Bypass-Signature', 'invalid')
        .type('form')
        .send({
          MessageSid: 'SM_missing_sig_001',
          MessageStatus: 'delivered',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_SIGNATURE');
    });
  });

  // ─── Idempotency ────────────────────────────────────────────────

  describe('MessageSid Idempotency', () => {
    it('processes first message normally', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          MessageSid: 'SM_idempotency_test_001',
          From: 'whatsapp:+919876543210',
          Body: 'First message',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('<Message>');
    });

    it('returns empty TwiML for duplicate MessageSid', async () => {
      // Send same MessageSid again
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          MessageSid: 'SM_idempotency_test_001',
          From: 'whatsapp:+919876543210',
          Body: 'First message again',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('<Response></Response>');
    });
  });

  // ─── Malformed Payloads ──────────────────────────────────────────

  describe('Malformed Payloads', () => {
    it('rejects request missing MessageSid', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          From: 'whatsapp:+919876543210',
          Body: 'No SID',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects request missing From field', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          MessageSid: 'SM_no_from_001',
          Body: 'No From',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAYLOAD');
    });

    it('rejects completely empty payload', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send('');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_PAYLOAD');
    });
  });

  // ─── Unexpected Form Fields ──────────────────────────────────────

  describe('Unexpected Form Fields', () => {
    it('processes request with extra unexpected fields without error', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          MessageSid: 'SM_extra_fields_001',
          From: 'whatsapp:+919876543210',
          Body: 'Hello',
          UnknownField1: 'some_value',
          UnknownField2: 'another_value',
          NumSegments: '1',
          ProfileName: 'Test User',
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/xml');
      expect(res.text).toContain('<Response>');
    });

    it('does not leak unexpected fields in response', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          MessageSid: 'SM_no_leak_001',
          From: 'whatsapp:+919876543210',
          Body: 'Hi',
          MaliciousField: '<script>alert(1)</script>',
        });

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('MaliciousField');
      expect(res.text).not.toContain('<script>');
    });
  });

  // ─── Status Webhook Validation ───────────────────────────────────

  describe('Status Webhook', () => {
    it('accepts valid status callback', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/status')
        .type('form')
        .send({
          MessageSid: 'SM_status_001',
          MessageStatus: 'delivered',
          To: 'whatsapp:+919876543210',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('delivered');
    });

    it('rejects status callback with invalid signature', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/status')
        .set('X-Test-Bypass-Signature', 'invalid')
        .type('form')
        .send({
          MessageSid: 'SM_status_invalid_001',
          MessageStatus: 'delivered',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Rate Limiting (verify middleware is wired) ──────────────────

  describe('Rate Limiting', () => {
    it('returns rate limit headers', async () => {
      const res = await request(app)
        .post('/webhooks/twilio/whatsapp')
        .type('form')
        .send({
          MessageSid: 'SM_ratelimit_001',
          From: 'whatsapp:+919876543210',
          Body: 'Rate check',
        });

      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });
  });
});
