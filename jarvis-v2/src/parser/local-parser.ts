import type { Intent, PrescriptionDraft } from '../types.js';

function title(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractFrequency(text: string): string {
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
  if (webSearchMatch?.[1]) {
    return { kind: 'web_search', query: webSearchMatch[1].trim() };
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|greeting|greetings|hello friday|hey friday|hi friday|hello jarvis|hey jarvis|hi jarvis|friday)/i.test(lower) || /greeting to (the )?(friday|jarvis)/i.test(lower)) {
    return { kind: 'greeting' };
  }

  if (/what is installed|what is in the database|database name|name in the database|database info/i.test(lower)) {
    return { kind: 'database_info' };
  }

  if (/\b(help|what can you do|commands)\b/.test(lower)) {
    return { kind: 'help' };
  }

  if (/low[- ]stock|running low|reorder/.test(lower)) {
    return { kind: 'low_stock' };
  }

  if (/add\s+(?:the\s+)?(?:selected\s+)?(?:inventory\s+)?(?:medicine|item)\s+to\s+(?:this\s+)?(?:prescription\s+)?draft/i.test(lower)) {
    return { kind: 'add_inventory_to_draft' };
  }

  const increaseStockMatch = lower.match(/(?:increase|add|raise)\s+(?:stock|inventory)\s*(?:of\s+([a-z0-9\s-]+?))?\s+by\s+(\d+)/i);
  if (increaseStockMatch) {
    return {
      kind: 'mutate_inventory_stock',
      mode: 'increase',
      amount: parseInt(increaseStockMatch[2]!, 10),
      query: increaseStockMatch[1]?.trim(),
    };
  }

  const setStockMatch = lower.match(/(?:set)\s+(?:stock|inventory)\s*(?:of\s+([a-z0-9\s-]+?))?\s+to\s+(\d+)/i);
  if (setStockMatch) {
    return {
      kind: 'mutate_inventory_stock',
      mode: 'set',
      amount: parseInt(setStockMatch[2]!, 10),
      query: setStockMatch[1]?.trim(),
    };
  }

  const isStockMatch = lower.match(/(?:is|do\s+we\s+have|check\s+if)\s+([a-z0-9\s-]+?)\s+(?:is\s+)?in\s+stock/i)
    ?? lower.match(/([a-z0-9\s-]+?)\s+(?:in\s+stock|stock\s+level)/i);
  if (isStockMatch?.[1] && !/low/i.test(isStockMatch[1])) {
    return { kind: 'inventory_search', query: isStockMatch[1].trim() };
  }

  const earlyInventory = value.match(/(?:search|find|check|show)\s+(.+?)\s+(?:in\s+)?(?:inventory|stock)/i) ?? value.match(/(?:inventory|stock)\s+(?:for\s+)?(.+)/i);
  if (earlyInventory?.[1]) {
    return { kind: 'inventory_search', query: earlyInventory[1].trim() };
  }

  const findMedicineMatch = value.match(/^(?:find|search|check|look\s+up)\s+([A-Za-z0-9\s-]+)$/i);
  if (findMedicineMatch?.[1]) {
    const q = findMedicineMatch[1].trim();
    if (!/patient|queue|appointment/i.test(q) && (/\d+|(?:tablet|cap|tab|syr|inj|mg|g|mcg|ml|paracetamol|augmentin|amoxicillin|ibuprofen|crocin|dolo|azithromycin)/i.test(q) || q.toLowerCase().includes('augmentin'))) {
      return { kind: 'inventory_search', query: q };
    }
  }

  // Appointment intents (PROMPT 14)
  if (/today'?s?\s+appointments|appointments\s+(?:for\s+)?today|schedule\s+today|appointments\s+board/i.test(lower)) {
    return { kind: 'today_appointments' };
  }

  if (/next\s+appointment|when\s+is\s+(?:the\s+)?next\s+appointment/i.test(lower)) {
    return { kind: 'next_appointment' };
  }

  if (/(?:patient\s+)?appointment\s+status|check\s+(?:patient\s+)?appointment\s+status|status\s+of\s+appointment/i.test(lower)) {
    return { kind: 'appointment_status' };
  }

  if (/(?:prepare|draft|fill|setup)\s+(?:an?\s+)?appointment\s+(?:form|details|request|slot)?/i.test(lower)) {
    const timeMatch = lower.match(/(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    const reasonMatch = lower.match(/(?:for\s+)(follow[- ]up|consultation|checkup|routine|review)/i);
    return {
      kind: 'draft_appointment',
      date: lower.includes('tomorrow') ? 'tomorrow' : undefined,
      time: timeMatch?.[1],
      reason: reasonMatch?.[1],
    };
  }

  const mutateApptMatch = lower.match(/(create|schedule|book|reschedule|move|change|cancel|confirm)\s+(?:an?\s+)?(?:patient\s+)?appointment/i);
  if (mutateApptMatch?.[1]) {
    const rawAction = mutateApptMatch[1].toLowerCase();
    const action: 'create' | 'reschedule' | 'cancel' | 'confirm' =
      rawAction === 'reschedule' || rawAction === 'move' || rawAction === 'change'
        ? 'reschedule'
        : rawAction === 'cancel'
        ? 'cancel'
        : rawAction === 'confirm'
        ? 'confirm'
        : 'create';

    return {
      kind: 'mutate_appointment',
      action,
    };
  }

  // Operational Metrics intents (PROMPT 17)
  if (/how\s+many\s+(?:patients\s+)?did\s+i\s+see(?:\s+today)?|patients?\s+seen\s+today|completed\s+patients?\s+today/i.test(lower)) {
    return { kind: 'patients_seen_today' };
  }

  if (/how\s+many\s+(?:patients\s+)?are\s+waiting(?:\s+today)?|patients?\s+waiting\s+count|currently\s+waiting/i.test(lower)) {
    return { kind: 'patients_waiting' };
  }

  if (/(?:show|view|get)\s+(?:the\s+)?operational\s+summary|clinic\s+operational\s+summary|operational\s+performance/i.test(lower)) {
    return { kind: 'operational_summary' };
  }

  const queueNumber = value.match(/(?:queue(?:\s+number)?|number)\s*(\d+)/i);
  if (queueNumber && /(?:open|find|who)/i.test(value)) {
    return { kind: 'patient_lookup', query: `queue ${queueNumber[1]}`, lookupType: 'queue_number' };
  }

  const patientCode = value.match(/\b(?:RXF-[A-F0-9]{6}|[a-f0-9]{24})\b/i);
  if (patientCode) {
    return { kind: 'patient_lookup', query: patientCode[0], lookupType: 'patient_id' };
  }

  const named = value.match(/(?:open|find|search|show|check|check\s+(?:the\s+)?(?:particular\s+)?name\s+of\s+(?:the\s+)?patient)\s+(?:patient\s+)?([\p{L}][\p{L}\s'.-]{1,80})/iu);
  if (named && !/inventory|medicine|stock|queue|prescription|appointment|whatsapp|message|notification|reminder|template|operational|summary/i.test(named[1] ?? '')) {
    return { kind: 'patient_lookup', query: named[1]!.trim(), lookupType: 'name' };
  }

  // Template intents (PROMPT 16)
  if (/(?:open|show|list)\s+(?:my\s+)?(?:prescription\s+)?templates?/i.test(lower)) {
    return { kind: 'list_templates' };
  }

  const useTemplateMatch = value.match(/(?:use|apply)\s+template\s+(.+)/i);
  if (useTemplateMatch?.[1]) {
    return { kind: 'use_template', templateName: useTemplateMatch[1].trim() };
  }

  if (/fill\s+(?:this\s+)?(?:blank\s+)?template/i.test(lower)) {
    return { kind: 'fill_blank_template' };
  }

  const saveTemplateMatch = lower.match(/save\s+(?:this\s+)?as\s+(?:a\s+)?(?:draft\s+)?template\s*(?:named\s+(.+))?/i) ?? lower.match(/create\s+(?:a\s+)?template\s*(?:named\s+(.+))?/i);
  if (saveTemplateMatch) {
    return { kind: 'save_draft_template', title: saveTemplateMatch[1]?.trim() };
  }

  if (/how many.*(?:patients|queue)|remaining patients|queue count/.test(lower)) {
    return { kind: 'queue', mode: 'remaining' };
  }
  if (/who.*next|next patient/.test(lower)) {
    return { kind: 'queue', mode: 'next' };
  }
  if (/current patient|who.*current/.test(lower)) {
    return { kind: 'queue', mode: 'current' };
  }
  if (/show.*queue|waiting queue/.test(lower)) {
    return { kind: 'queue', mode: 'list' };
  }

  if (/recent prescriptions|previous prescriptions|last prescription/.test(lower)) {
    return { kind: 'recent_prescriptions' };
  }

  if (/reminder\s+status|status\s+of\s+(?:appointment\s+)?reminders?|reminder\s+delivery/i.test(lower)) {
    return { kind: 'reminder_status' };
  }

  if (/communication status|whatsapp status|message status|delivery status/.test(lower)) {
    return { kind: 'communication_status' };
  }

  if (/(?:prepare|draft|compose)\s+(?:a\s+)?(?:message|whatsapp|notification)\s+(?:draft|text|template)?/i.test(lower)) {
    return { kind: 'draft_communication' };
  }

  if (/(?:send|queue|schedule)\s+(?:a\s+)?(?:whatsapp\s+)?(?:patient\s+)?(?:appointment\s+)?(?:notification|message|reminder|confirmation)/i.test(lower) || /(?:send|queue|schedule)\s+.*(?:notification|message|reminder|confirmation|whatsapp)/i.test(lower)) {
    return { kind: 'mutate_communication' };
  }

  const medicineMatch = value.match(/(?:add|prescribe|draft|fill\s+draft|fill\s+prescription)\s+([a-z][a-z\s-]{1,80}?)(?:\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|units?)))?(?:\s+(.+))?$/i);
  if (medicineMatch && medicineMatch[1]) {
    const rest = medicineMatch[3] ?? '';
    const duration = rest.match(/for\s+(\d+\s+(?:days|day|weeks|week|months|month))/i)?.[1] ?? '';
    const instructions = /after food/i.test(rest) ? 'After food' : /before food/i.test(rest) ? 'Before food' : /with food/i.test(rest) ? 'With food' : '';
    const medicineName = title(medicineMatch[1]);
    const dosage = medicineMatch[2]?.replace(/\s+/g, '') ?? '';
    const freq = extractFrequency(rest);

    const draft: PrescriptionDraft = {
      diagnosis: '',
      doctorNotes: '',
      medicines: [{
        name: medicineName,
        dosage,
        frequency: freq,
        duration,
        instructions,
      }],
      missingFields: [],
      warnings: [],
    };

    if (!dosage) draft.missingFields.push('dosage');
    if (!freq) draft.missingFields.push('frequency');
    if (!duration) draft.missingFields.push('duration');

    return { kind: 'prescription_draft', draft };
  }

  if (/prepare.*patient access|generate.*patient access|prepare.*prescription.*patient/i.test(lower)) {
    return { kind: 'prepare_patient_access' };
  }
  if (/access status|prescription access status|link status/i.test(lower)) {
    return { kind: 'access_status' };
  }

  return { kind: 'unknown' };
}
