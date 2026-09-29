import { describe, it, expect } from 'vitest';
import { ProviderError } from '../src/providers/provider-interface.js';

describe('No Secret Leakage Verification', () => {
  it('masks OpenAI secret keys in error messages', () => {
    const rawSecret = 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz';
    const error = new ProviderError('openai', 'TEST_ERR', `Failed to connect with key ${rawSecret}`);

    expect(error.message).not.toContain(rawSecret);
    expect(error.message).toContain('[REDACTED_API_KEY]');
  });

  it('masks Gemini Google API keys in error messages', () => {
    const rawSecret = 'AIzaSyA1b2C3d4E5f6G7h8I9j0k1l2m3n4o5p6';
    const error = new ProviderError('gemini', 'TEST_ERR', `Failed request for ${rawSecret}`);

    expect(error.message).not.toContain(rawSecret);
    expect(error.message).toContain('[REDACTED_API_KEY]');
  });

  it('masks URL query string key parameters', () => {
    const error = new ProviderError('gemini', 'HTTP_500', 'Failed URL https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyA1b2C3d4E5f6G7h8I9j0k1l2m3n4o5p6');

    expect(error.message).not.toContain('AIzaSyA1b2C3d4E5f6G7h8I9j0k1l2m3n4o5p6');
    expect(error.message).toContain('[REDACTED_API_KEY]');
  });
});
