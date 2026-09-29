export function pdfBlobFromArrayBuffer(data: ArrayBuffer): Blob {
  const bytes = new Uint8Array(data);
  const signature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (bytes.byteLength < signature.length || !signature.every((value, index) => bytes[index] === value))
    throw new Error('The server returned an invalid prescription PDF. Please retry.');
  return new Blob([data], { type: 'application/pdf' });
}
