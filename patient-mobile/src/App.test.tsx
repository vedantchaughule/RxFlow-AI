import { describe, expect, it } from 'vitest';
import { prescriptionPathFromPortalUrl } from './secure-url';

describe('patient-mobile secure QR URL handling', () => {
  it('accepts only an opaque prescription route on the configured portal', () => {
    const token = 'A'.repeat(43);
    expect(prescriptionPathFromPortalUrl(`https://patient.example/prescription/${token}`, 'localhost:5174', 'patient.example')).toBe(`/prescription/${token}`);
  });

  it('rejects external URLs and non-prescription routes', () => {
    const token = 'A'.repeat(43);
    expect(() => prescriptionPathFromPortalUrl(`https://attacker.example/prescription/${token}`, 'localhost:5174', 'patient.example')).toThrow('secure RxFlow prescription link');
    expect(() => prescriptionPathFromPortalUrl(`https://patient.example/appointment/${token}`, 'localhost:5174', 'patient.example')).toThrow('secure RxFlow prescription link');
  });
});
