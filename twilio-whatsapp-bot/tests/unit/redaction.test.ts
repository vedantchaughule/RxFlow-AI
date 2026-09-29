import { describe, it, expect } from 'vitest';
import { redactPhone, redactSensitiveData } from '../../src/security/redaction.js';

describe('Phone Redaction (PROMPT 03)', () => {
  it('redacts middle digits of a full phone number', () => {
    expect(redactPhone('+919876543210')).toBe('+919****3210');
  });

  it('redacts whatsapp: prefixed number', () => {
    expect(redactPhone('whatsapp:+919876543210')).toBe('+919****3210');
  });

  it('returns **** for very short numbers', () => {
    expect(redactPhone('12345')).toBe('****');
  });

  it('returns empty string for null/undefined', () => {
    expect(redactPhone('')).toBe('');
    expect(redactPhone(null as unknown as string)).toBe('');
  });

  it('redactSensitiveData redacts phone/from/to keys', () => {
    const result = redactSensitiveData({
      phone: '+919876543210',
      from: 'whatsapp:+919876543210',
      to: '+14155238886',
      name: 'Test User',
    });

    expect(result.phone).toBe('+919****3210');
    expect(result.from).toBe('+919****3210');
    expect(result.to).toBe('+141****8886');
    expect(result.name).toBe('Test User');
  });

  it('redactSensitiveData redacts token/secret/auth keys', () => {
    const result = redactSensitiveData({
      authToken: 'supersecret123',
      apiSecret: 'topsecret',
      name: 'visible',
    });

    expect(result.authToken).toBe('[REDACTED]');
    expect(result.apiSecret).toBe('[REDACTED]');
    expect(result.name).toBe('visible');
  });
});
