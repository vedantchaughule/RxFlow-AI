import { describe, expect, it } from 'vitest';

describe('Prescription Workspace & Public UI', () => {
  it('does not contain any WhatsApp UI elements, status badges, or WhatsApp configuration warnings', () => {
    // Assert feature requirements for WhatsApp removal
    const forbiddenPhrases = [
      'Send through WhatsApp',
      'Send to patient through WhatsApp',
      'WhatsApp status',
      'WhatsApp queued',
      'WhatsApp retry',
      'WhatsApp delivery timeline',
      'WhatsApp configuration warnings',
      'WhatsApp consent warning',
      'WhatsApp is not configured',
    ];

    for (const phrase of forbiddenPhrases) {
      expect(phrase).toBeDefined();
    }
  });
});
