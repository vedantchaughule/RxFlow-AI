import { describe, it, expect } from 'vitest';
import {
  isWithin24HourWindow,
  getContentSidForTemplate,
  prepareOutboundMessage,
  TWILIO_24H_WINDOW_MS,
} from '../../src/twilio/whatsapp-template.service.js';
import { env } from '../../src/config/env.js';

describe('24-Hour WhatsApp Rule and Templates (PROMPT 17)', () => {
  describe('isWithin24HourWindow', () => {
    it('returns true when last message was received 1 hour ago', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      expect(isWithin24HourWindow(oneHourAgo)).toBe(true);
    });

    it('returns true when last message was received 23 hours ago', () => {
      const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);
      expect(isWithin24HourWindow(twentyThreeHoursAgo)).toBe(true);
    });

    it('returns false when last message was received 25 hours ago', () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      expect(isWithin24HourWindow(twentyFiveHoursAgo)).toBe(false);
    });

    it('returns false when last message timestamp is missing or invalid', () => {
      expect(isWithin24HourWindow(undefined)).toBe(false);
      expect(isWithin24HourWindow('invalid-date')).toBe(false);
    });
  });

  describe('getContentSidForTemplate', () => {
    it('resolves Content SID from environment placeholders without hardcoding', () => {
      expect(getContentSidForTemplate('confirmation')).toBe(env.TWILIO_APPOINTMENT_CONFIRMATION_CONTENT_SID);
      expect(getContentSidForTemplate('reminder')).toBe(env.TWILIO_APPOINTMENT_REMINDER_CONTENT_SID);
      expect(getContentSidForTemplate('cancelled')).toBe(env.TWILIO_APPOINTMENT_CANCELLED_CONTENT_SID);
    });
  });

  describe('prepareOutboundMessage', () => {
    it('prepares in-session conversational message when within 24-hour window', () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const payload = prepareOutboundMessage({
        to: 'whatsapp:+919876543210',
        body: 'Hello, your appointment is confirmed.',
        lastPatientMessageAt: recentDate,
      });

      expect(payload.messageType).toBe('in_session');
      expect(payload.body).toBe('Hello, your appointment is confirmed.');
      expect(payload.contentSid).toBeUndefined();
    });

    it('prepares business-initiated template message when outside 24-hour window', () => {
      const oldDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
      const payload = prepareOutboundMessage({
        to: 'whatsapp:+919876543210',
        templateKind: 'reminder',
        contentVariables: { '1': 'Rahul', '2': '10:30 AM' },
        lastPatientMessageAt: oldDate,
      });

      expect(payload.messageType).toBe('business_initiated_template');
      expect(payload.contentSid).toBe(env.TWILIO_APPOINTMENT_REMINDER_CONTENT_SID);
      expect(JSON.parse(payload.contentVariables || '{}')).toEqual({ '1': 'Rahul', '2': '10:30 AM' });
    });

    it('throws error if in-session message body is missing within window', () => {
      const recentDate = new Date(Date.now() - 10 * 60 * 1000);
      expect(() =>
        prepareOutboundMessage({
          to: 'whatsapp:+919876543210',
          lastPatientMessageAt: recentDate,
        })
      ).toThrow('Message body is required');
    });
  });
});
