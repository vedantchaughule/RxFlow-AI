import { describe, expect, it } from 'vitest';
import { pdfBlobFromArrayBuffer } from './pdf-blob';

describe('prescription PDF response validation', () => {
  it('creates an explicitly typed PDF blob from valid PDF bytes', () => {
    const data = new TextEncoder().encode('%PDF-1.7\n').buffer;
    expect(pdfBlobFromArrayBuffer(data).type).toBe('application/pdf');
  });

  it('rejects non-PDF response bodies before the browser viewer receives them', () => {
    const data = new TextEncoder().encode('{"success":false}').buffer;
    expect(() => pdfBlobFromArrayBuffer(data)).toThrow('invalid prescription PDF');
  });
});
