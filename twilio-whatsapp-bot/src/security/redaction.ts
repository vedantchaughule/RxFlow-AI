/**
 * Redacts phone numbers and sensitive information from log statements.
 * e.g. "whatsapp:+919876543210" -> "whatsapp:+91****3210"
 */
export function redactPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.length <= 6) return '****';
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-4);
  return `${prefix}****${suffix}`;
}

export function redactSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().includes('phone') || key.toLowerCase() === 'from' || key.toLowerCase() === 'to') {
      redacted[key] = typeof value === 'string' ? redactPhone(value) : value;
    } else if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('auth')) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}
