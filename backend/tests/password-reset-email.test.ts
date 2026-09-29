import { beforeEach, describe, expect, it } from 'vitest';
import { CapturePasswordResetEmailAdapter } from '../src/modules/auth/password-reset-email.js';

describe('password reset email capture adapter', () => {
  const adapter = new CapturePasswordResetEmailAdapter();

  beforeEach(() => adapter.clear());

  it('captures reset delivery in memory without logging or persisting it', async () => {
    await adapter.sendPasswordReset({
      to: 'user@example.test',
      resetUrl: 'http://localhost:5173/reset-password?token=secret-test-token',
      expiresInMinutes: 30,
    });

    expect(adapter.latestFor('user@example.test')).toEqual({
      to: 'user@example.test',
      resetUrl: 'http://localhost:5173/reset-password?token=secret-test-token',
      expiresInMinutes: 30,
    });
    adapter.clear();
    expect(adapter.latestFor('user@example.test')).toBeUndefined();
  });
});
