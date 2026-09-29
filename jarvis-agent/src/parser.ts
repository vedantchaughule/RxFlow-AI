import { z } from 'zod';

export type Intent =
  | { kind: 'patient_lookup'; query: string; lookupType: 'auto' | 'patient_id' | 'name' | 'queue_number' }
  | { kind: 'queue'; mode: 'remaining' | 'next' | 'current' | 'list' }
  | { kind: 'inventory_search'; query: string }
  | { kind: 'low_stock' }
  | { kind: 'patient_context' }
  | { kind: 'recent_prescriptions' }
  | { kind: 'communication_status' }
  | { kind: 'prescription_draft'; draft: PrescriptionDraft }
  | { kind: 'greeting' }
  | { kind: 'prepare_patient_access' }
  | { kind: 'access_status' }
  | { kind: 'database_info' }
  | { kind: 'web_search'; query: string }
  | { kind: 'help' }
  | { kind: 'unknown' };

export const prescriptionDraftSchema = z.strictObject({
  diagnosis: z.string().max(1000).default(''),
  doctorNotes: z.string().max(2000).default(''),
  medicines: z.array(z.strictObject({ name: z.string().min(1).max(200), dosage: z.string().max(120).default(''), frequency: z.string().max(200).default(''), duration: z.string().max(120).default(''), instructions: z.string().max(500).default('') })).min(1).max(20),
  missingFields: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type PrescriptionDraft = z.infer<typeof prescriptionDraftSchema>;

function title(value: string) { return value.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function frequency(text: string) {
  const source = text.toLowerCase();
  if (/three times|thrice|tid/.test(source)) return 'Three times daily';
  if (/twice|two times|bid/.test(source)) return 'Twice daily';
  if (/once|one time|od\b/.test(source)) return 'Once daily';
  if (/four times|qid/.test(source)) return 'Four times daily';
  return '';
}

export function parseLocalIntent(message: string): Intent {
  const value = message.trim();
  const lower = value.toLowerCase();

  const webSearchMatch = value.match(/(?:web\s+search|google\s+search|search\s+(?:the\s+)?web\s+(?:for\s+)?|search\s+online\s+(?:for\s+)?|look\s+up\s+online\s+(?:for\s+)?)(.+)/i);
  if (webSearchMatch?.[1]) return { kind: 'web_search', query: webSearchMatch[1].trim() };

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|greeting|greetings|hello friday|hey friday|hi friday|hello jarvis|hey jarvis|hi jarvis|friday)/i.test(lower) || /greeting to (the )?(friday|jarvis)/i.test(lower)) return { kind: 'greeting' };
  if (/what is installed|what is in the database|database name|name in the database|database info/i.test(lower)) return { kind: 'database_info' };
  if (/\b(help|what can you do|commands)\b/.test(lower)) return { kind: 'help' };
  if (/low[- ]stock|running low|reorder/.test(lower)) return { kind: 'low_stock' };
  const earlyInventory = value.match(/(?:search|find|check|show)\s+(.+?)\s+(?:in\s+)?(?:inventory|stock)/i) ?? value.match(/(?:inventory|stock)\s+(?:for\s+)?(.+)/i);
  if (earlyInventory?.[1]) return { kind: 'inventory_search', query: earlyInventory[1].trim() };
  const queueNumber = value.match(/(?:queue(?:\s+number)?|number)\s*(\d+)/i);
  if (queueNumber && /(?:open|find|who)/i.test(value)) return { kind: 'patient_lookup', query: `queue ${queueNumber[1]}`, lookupType: 'queue_number' };
  const patientCode = value.match(/\b(?:RXF-[A-F0-9]{6}|[a-f0-9]{24})\b/i);
  if (patientCode) return { kind: 'patient_lookup', query: patientCode[0], lookupType: 'patient_id' };
  const named = value.match(/(?:open|find|search|show|check|check\s+(?:the\s+)?(?:particular\s+)?name\s+of\s+(?:the\s+)?patient)\s+(?:patient\s+)?([\p{L}][\p{L}\s'.-]{1,80})/iu);
  if (named && !/inventory|medicine|stock|queue|prescription/i.test(named[1] ?? '')) return { kind: 'patient_lookup', query: named[1]!.trim(), lookupType: 'name' };
  if (/how many.*(?:patients|queue)|remaining patients|queue count/.test(lower)) return { kind: 'queue', mode: 'remaining' };
  if (/who.*next|next patient/.test(lower)) return { kind: 'queue', mode: 'next' };
  if (/current patient|who.*current/.test(lower)) return { kind: 'queue', mode: 'current' };
  if (/show.*queue|waiting queue/.test(lower)) return { kind: 'queue', mode: 'list' };
  if (/patient.*(?:summary|context|details)|show.*patient information/.test(lower)) return { kind: 'patient_context' };
  if (/recent prescriptions|previous prescriptions|last prescription/.test(lower)) return { kind: 'recent_prescriptions' };
  if (/communication status|whatsapp status|message status|delivery status/.test(lower)) return { kind: 'communication_status' };
  const medicineMatch = value.match(/(?:add|prescribe|draft|fill\s+draft|fill\s+prescription)\s+([a-z][a-z\s-]{1,80}?)(?:\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?)))?(?:\s+(.+))?$/i);
  if (medicineMatch) {
    const rest = medicineMatch[3] ?? '';
    const duration = rest.match(/for\s+(\d+\s+(?:day|days|week|weeks|month|months))/i)?.[1] ?? '';
    const instructions = /after food/i.test(rest) ? 'After food' : /before food/i.test(rest) ? 'Before food' : /with food/i.test(rest) ? 'With food' : '';
    const draft: PrescriptionDraft = { diagnosis: '', doctorNotes: '', medicines: [{ name: title(medicineMatch[1]!), dosage: medicineMatch[2]?.replace(/\s+/g, '') ?? '', frequency: frequency(rest), duration, instructions }], missingFields: [], warnings: [] };
    for (const field of ['dosage', 'frequency', 'duration'] as const) if (!draft.medicines[0]![field]) draft.missingFields.push(field);
    return { kind: 'prescription_draft', draft };
  }
  if (/prepare.*patient access|generate.*patient access|prepare.*prescription.*patient/i.test(lower)) return { kind: 'prepare_patient_access' };
  if (/access status|prescription access status|link status/i.test(lower)) return { kind: 'access_status' };
  return { kind: 'unknown' };
}
