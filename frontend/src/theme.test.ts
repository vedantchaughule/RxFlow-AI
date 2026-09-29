import { describe, expect, it } from 'vitest';
import { isValidHex } from './theme';

describe('isValidHex', () => {
  it('accepts six-digit clinic brand colours', () => {
    expect(isValidHex('#0f766e')).toBe(true);
    expect(isValidHex('#ABC123')).toBe(true);
  });

  it('rejects unsafe or incomplete colour values', () => {
    expect(isValidHex('0f766e')).toBe(false);
    expect(isValidHex('#fff')).toBe(false);
    expect(isValidHex('rgb(0, 0, 0)')).toBe(false);
  });
});
