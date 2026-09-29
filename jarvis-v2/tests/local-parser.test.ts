import { describe, it, expect } from 'vitest';
import { parseLocalIntent } from '../src/parser/local-parser.js';

describe('Local Deterministic Intent Parser', () => {
  it('parses greeting intents correctly', () => {
    expect(parseLocalIntent('Hello Friday')).toEqual({ kind: 'greeting' });
    expect(parseLocalIntent('Hi Jarvis')).toEqual({ kind: 'greeting' });
    expect(parseLocalIntent('good morning')).toEqual({ kind: 'greeting' });
  });

  it('parses help and command intents', () => {
    expect(parseLocalIntent('help')).toEqual({ kind: 'help' });
    expect(parseLocalIntent('what can you do')).toEqual({ kind: 'help' });
  });

  it('parses patient lookup by name using synthetic test fixtures', () => {
    const result = parseLocalIntent('Find patient Synthetic Patient Alpha');
    expect(result).toEqual({
      kind: 'patient_lookup',
      query: 'Synthetic Patient Alpha',
      lookupType: 'name',
    });
  });

  it('parses patient lookup by RXF ID', () => {
    const result = parseLocalIntent('Open RXF-A1B2C3');
    expect(result).toEqual({
      kind: 'patient_lookup',
      query: 'RXF-A1B2C3',
      lookupType: 'patient_id',
    });
  });

  it('parses queue queries', () => {
    expect(parseLocalIntent('How many patients remaining?')).toEqual({
      kind: 'queue',
      mode: 'remaining',
    });
    expect(parseLocalIntent('Who is next?')).toEqual({
      kind: 'queue',
      mode: 'next',
    });
    expect(parseLocalIntent('Who is current patient?')).toEqual({
      kind: 'queue',
      mode: 'current',
    });
    expect(parseLocalIntent('Show waiting queue')).toEqual({
      kind: 'queue',
      mode: 'list',
    });
  });

  it('parses inventory search and low stock queries', () => {
    expect(parseLocalIntent('Search Paracetamol in inventory')).toEqual({
      kind: 'inventory_search',
      query: 'Paracetamol',
    });
    expect(parseLocalIntent('Show low stock medicines')).toEqual({
      kind: 'low_stock',
    });
  });

  it('parses medicine prescription draft from dictated text', () => {
    const result = parseLocalIntent('Prescribe Amoxicillin 500mg twice daily for 7 days after food');
    expect(result.kind).toBe('prescription_draft');
    if (result.kind === 'prescription_draft') {
      expect(result.draft.medicines[0]?.name).toBe('Amoxicillin');
      expect(result.draft.medicines[0]?.dosage).toBe('500mg');
      expect(result.draft.medicines[0]?.frequency).toBe('Twice daily');
      expect(result.draft.medicines[0]?.duration).toBe('7 days');
      expect(result.draft.medicines[0]?.instructions).toBe('After food');
      expect(result.draft.missingFields).toHaveLength(0);
    }
  });

  it('flags missing required fields in prescription draft', () => {
    const result = parseLocalIntent('Draft Paracetamol 500mg');
    expect(result.kind).toBe('prescription_draft');
    if (result.kind === 'prescription_draft') {
      expect(result.draft.medicines[0]?.name).toBe('Paracetamol');
      expect(result.draft.missingFields).toContain('frequency');
      expect(result.draft.missingFields).toContain('duration');
    }
  });

  it('returns unknown for unrecognizable commands', () => {
    expect(parseLocalIntent('xyz123 random phrase')).toEqual({ kind: 'unknown' });
  });
});
