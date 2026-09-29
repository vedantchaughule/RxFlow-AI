import { describe, expect, it } from 'vitest';
import { parseLocalIntent } from '../../src/parser.js';
describe('local Jarvis intent parser', () => {
  it.each([
    ['How many patients are remaining?', 'queue'],
    ['Open patient RXF-ABC123', 'patient_lookup'],
    ['Search paracetamol 500 mg in inventory', 'inventory_search'],
    ['Show low-stock medicines', 'low_stock'],
    ['Add paracetamol 500 mg twice daily for five days after food', 'prescription_draft'],
  ])('parses %s', (message, kind) => expect(parseLocalIntent(message).kind).toBe(kind));
});
