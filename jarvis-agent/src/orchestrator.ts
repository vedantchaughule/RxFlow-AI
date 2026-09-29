import { env } from './env.js';
import { runTool } from './backend-client.js';
import { parseLocalIntent, type Intent } from './parser.js';
import { parseWithProvider } from './provider.js';
import { runWebSearchSubAgent } from './web-search.js';
import type { JarvisClaims, JarvisResponse } from './types.js';

type SessionContext = {
  pendingTask?: { type: 'patient_lookup' | 'prescription_draft'; targetName?: string; draft?: unknown };
};
const sessionMemoryMap = new Map<string, SessionContext>();

const idempotency = new Map<string, { expires: number; response: JarvisResponse }>();
function cleanup() {
  const now = Date.now();
  for (const [key, value] of idempotency) if (value.expires <= now) idempotency.delete(key);
}
function card(type: string, title: string, data: unknown) { return { type, title, data }; }

async function intentFor(message: string, signal: AbortSignal): Promise<Intent> {
  const local = parseLocalIntent(message);
  if (local.kind !== 'unknown') return local;
  if (env.AI_PROVIDER === 'none') return local;
  try { return await parseWithProvider(message, signal); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'PROVIDER_ERROR';
    if (signal.aborted) throw Object.assign(new Error('The AI provider request timed out or was cancelled'), { status: 504, code: 'PROVIDER_TIMEOUT' });
    if (/HTTP_429/.test(message)) throw Object.assign(new Error('The AI provider is rate limited'), { status: 503, code: 'PROVIDER_RATE_LIMITED' });
    throw Object.assign(new Error('The AI provider could not interpret the request'), { status: 502, code: 'PROVIDER_ERROR' });
  }
}

export async function runTurn(claims: JarvisClaims, input: { message: string; clientTurnId: string }, externalSignal?: AbortSignal): Promise<JarvisResponse> {
  cleanup();
  const key = `${claims.sessionId}:${input.clientTurnId}`;
  const previous = idempotency.get(key);
  if (previous) return previous.response;
  const timeout = AbortSignal.timeout(env.AGENT_REQUEST_TIMEOUT_MS);
  const signal = externalSignal ? AbortSignal.any([externalSignal, timeout]) : timeout;
  
  let intent = await intentFor(input.message, signal);
  const memory = sessionMemoryMap.get(claims.sessionId) ?? {};

  // Multi-turn context resolution
  if (intent.kind === 'unknown' && memory.pendingTask) {
    const text = input.message.trim();
    if (/^(RXF-[A-F0-9]{6}|[a-f0-9]{24}|\d{1,3}|\d{10})$/i.test(text) || /\b(number|phone|age|queue|rxf)\b/i.test(text)) {
      intent = { kind: 'patient_lookup', query: text, lookupType: 'auto' };
    }
  }

  let response: JarvisResponse;
  switch (intent.kind) {
    case 'patient_lookup': {
      const result = await runTool(claims.sessionId, 'lookup_patient', { query: intent.query, lookupType: intent.lookupType }, signal) as { status: string; patient?: Record<string, unknown>; matches?: unknown[] };
      if (result.status === 'exact_match' && result.patient) {
        sessionMemoryMap.delete(claims.sessionId);
        const action = await runTool(claims.sessionId, 'propose_patient_binding', { patientId: result.patient.id, queueEntryId: result.patient.queueEntryId }, signal) as { actionId: string; type: string; expiresAt: string; patient: unknown };
        response = { assistantText: `I found ${String(result.patient.name)}. Confirm this patient before I load clinical context.`, state: 'needs_confirmation', cards: [card('patient_match', 'Patient found', result.patient)], pendingAction: action, clientTurnId: input.clientTurnId };
      } else if (result.status === 'multiple_matches') {
        sessionMemoryMap.set(claims.sessionId, { pendingTask: { type: 'patient_lookup', targetName: intent.query } });
        response = { assistantText: 'I found multiple matching patients. What is the patient\'s phone number or RXF ID?', state: 'needs_confirmation', cards: (result.matches?.length ?? 0) > 0 ? [card('patient_matches', 'Choose a patient', result.matches ?? [])] : [], pendingAction: null, clientTurnId: input.clientTurnId };
      } else {
        sessionMemoryMap.set(claims.sessionId, { pendingTask: { type: 'patient_lookup', targetName: intent.query } });
        response = { assistantText: `I could not find "${intent.query}". What is the patient's phone number or age? Reply to complete the lookup.`, state: 'warning', cards: [], pendingAction: null, clientTurnId: input.clientTurnId };
      }
      break;
    }
    case 'queue': {
      const result = await runTool(claims.sessionId, 'get_queue_status', { mode: intent.mode }, signal) as Record<string, unknown>;
      const text = intent.mode === 'remaining' ? `There are ${String(result.remainingPatients ?? 0)} patients remaining.` : intent.mode === 'next' ? (result.next ? 'The next patient is ready in the queue.' : 'There is no next waiting patient.') : 'Here is your current queue information.';
      response = { assistantText: text, state: 'success', cards: [card('queue_status', 'Queue status', result)], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'inventory_search': {
      const result = await runTool(claims.sessionId, 'search_inventory', { query: intent.query }, signal) as { items?: unknown[] };
      const hasItems = Boolean(result.items?.length);
      response = { assistantText: hasItems ? `I found ${result.items!.length} inventory match${result.items!.length === 1 ? '' : 'es'}.` : 'No matching medicine was found in clinic inventory.', state: hasItems ? 'success' : 'warning', cards: hasItems ? [card('inventory_result', 'Inventory search', result)] : [], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'low_stock': {
      const result = await runTool(claims.sessionId, 'get_low_stock', {}, signal) as { items?: unknown[] };
      const hasItems = Boolean(result.items?.length);
      response = { assistantText: hasItems ? `${result.items!.length} medicines need stock attention.` : 'No medicines are currently at or below their reorder level.', state: hasItems ? 'warning' : 'success', cards: hasItems ? [card('low_stock', 'Low stock', result)] : [], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'patient_context': {
      const result = await runTool(claims.sessionId, 'get_patient_context', {}, signal);
      response = { assistantText: 'Here is the confirmed patient context.', state: 'success', cards: [card('patient_summary', 'Patient context', result)], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'recent_prescriptions': {
      const result = await runTool(claims.sessionId, 'get_recent_prescriptions', { limit: 3 }, signal);
      response = { assistantText: 'Here are the most recent finalized prescriptions for the confirmed patient.', state: 'success', cards: [card('recent_prescriptions', 'Recent prescriptions', result)], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'communication_status': {
      const result = await runTool(claims.sessionId, 'get_communication_status', {}, signal);
      response = { assistantText: 'Here is the actual communication status recorded by RxFlow.', state: 'success', cards: [card('communication_status', 'Communication status', result)], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'prescription_draft': {
      if (!claims.boundPatientId) {
        response = { assistantText: 'Confirm a patient before creating a prescription draft.', state: 'needs_confirmation', cards: [card('warning', 'Patient confirmation required', {})], pendingAction: null, clientTurnId: input.clientTurnId };
      } else {
        const action = await runTool(claims.sessionId, 'propose_prescription_draft', { draft: intent.draft }, signal) as { actionId: string; type: string; expiresAt: string; payload: unknown };
        response = {
          assistantText: intent.draft.missingFields.length ? 'I prepared a draft, but some fields are missing. Review every field before applying it.' : 'I prepared a prescription draft for doctor review.',
          state: intent.draft.missingFields.length ? 'warning' : 'needs_confirmation',
          cards: [card('prescription_draft', 'AI-assisted draft — doctor review required', intent.draft)],
          pendingAction: action,
          clientTurnId: input.clientTurnId,
        };
      }
      break;
    }
    case 'greeting': {
      response = { assistantText: 'Greetings Vedant! Good morning. I am Friday, your clinical AI assistant. How may I assist you with patient records, clinic queue, or medicine inventory today?', state: 'idle', cards: [], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'prepare_patient_access': {
      if (!claims.boundPatientId) {
        response = { assistantText: 'Confirm a patient before preparing secure prescription access.', state: 'needs_confirmation', cards: [card('warning', 'Patient confirmation required', {})], pendingAction: null, clientTurnId: input.clientTurnId };
      } else {
        const action = await runTool(claims.sessionId, 'prepare_patient_access', {}, signal) as { actionId: string; type: string; expiresAt: string; prescriptionId: string };
        response = {
          assistantText: 'Prescription is finalized and its PDF is ready. I can generate a secure 72-hour link and QR code. Confirm?',
          state: 'needs_confirmation',
          cards: [card('patient_access_proposal', 'Prepare secure patient access link & QR', { prescriptionId: action.prescriptionId })],
          pendingAction: action as any,
          clientTurnId: input.clientTurnId,
        };
      }
      break;
    }
    case 'access_status': {
      const result = await runTool(claims.sessionId, 'get_access_status', {}, signal);
      response = { assistantText: 'Here is the current prescription access status and timeline.', state: 'success', cards: [card('access_status', 'Prescription access status', result)], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'database_info': {
      response = { assistantText: 'The active database is RxFlow Doctor on MongoDB Atlas. It stores patient records, visit histories, clinic inventory, and appointment queues.', state: 'success', cards: [card('database_info', 'RxFlow Database Information', { database: 'MongoDB Atlas (Doctor)', status: 'Connected', collections: ['Patient', 'QueueEntry', 'Inventory', 'Prescription', 'Appointment'] })], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    case 'web_search': {
      const searchResult = await runWebSearchSubAgent(intent.query, signal);
      response = {
        assistantText: searchResult.summary,
        state: 'success',
        cards: [card('web_search_results', `Web Search: ${intent.query}`, searchResult)],
        pendingAction: null,
        clientTurnId: input.clientTurnId,
      };
      break;
    }
    case 'help': {
      response = { assistantText: 'You can ask me to find a patient, check your queue, search medicine inventory, show low stock, load recent prescriptions, check communication status, or prepare a medicine draft for your review.', state: 'idle', cards: [card('help', 'Friday commands', ['Open patient RXF-1042', 'How many patients are remaining?', 'Search paracetamol 500 mg in inventory', 'Show low-stock medicines', 'Add paracetamol 500 mg twice daily for five days after food'])], pendingAction: null, clientTurnId: input.clientTurnId };
      break;
    }
    default: {
      response = { assistantText: 'I did not understand that clinic task. Try a patient, queue, inventory, prescription-draft, or communication-status command.', state: 'warning', cards: [], pendingAction: null, clientTurnId: input.clientTurnId };
    }
  }
  idempotency.set(key, { expires: Date.now() + 10 * 60_000, response });
  return response;
}
