import { z } from 'zod';
import { env } from './env.js';
import { prescriptionDraftSchema, type Intent } from './parser.js';

const intentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('patient_lookup'), query: z.string(), lookupType: z.enum(['auto', 'patient_id', 'name', 'queue_number']) }),
  z.strictObject({ kind: z.literal('queue'), mode: z.enum(['remaining', 'next', 'current', 'list']) }),
  z.strictObject({ kind: z.literal('inventory_search'), query: z.string() }),
  z.strictObject({ kind: z.literal('low_stock') }),
  z.strictObject({ kind: z.literal('patient_context') }),
  z.strictObject({ kind: z.literal('recent_prescriptions') }),
  z.strictObject({ kind: z.literal('communication_status') }),
  z.strictObject({ kind: z.literal('prescription_draft'), draft: prescriptionDraftSchema }),
  z.strictObject({ kind: z.literal('web_search'), query: z.string() }),
  z.strictObject({ kind: z.literal('help') }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
const jsonSchema = z.toJSONSchema(intentSchema) as Record<string, unknown>;
const system = `You are an intent parser for a doctor-supervised clinic assistant. Return only the requested JSON. Never invent patient, queue, inventory, prescription, appointment, or delivery data. Use patient_lookup for names (including Indian/Hindi names such as Rahul, Priya, Amit, Rajesh, Sharma, Verma, Singh, Patel, Gupta, Kumar, etc.), RxFlow IDs, or queue numbers; queue for queue questions; inventory_search or low_stock for inventory; patient_context, recent_prescriptions, communication_status for confirmed-patient reads; prescription_draft only for explicitly dictated medicine drafts. A prescription draft is not a final prescription. Do not diagnose. Unknown requests use kind=unknown.`;

function textFromOpenAI(body: Record<string, unknown>): string | undefined {
  const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;
  const output = body.output as Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined;
  return output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text ?? (body.output_text as string | undefined);
}
function textFromGemini(body: Record<string, unknown>): string | undefined {
  const candidates = body.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  const candText = candidates?.[0]?.content?.parts?.[0]?.text;
  if (candText) return candText;
  if (typeof body.output_text === 'string') return body.output_text;
  const steps = body.steps as Array<{ type?: string; content?: Array<{ type?: string; text?: string }>; text?: string }> | undefined;
  return steps?.flatMap((step) => step.content ?? []).find((part) => part.type === 'text')?.text ?? steps?.find((step) => step.type === 'model_output')?.text;
}

function cleanGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(cleanGeminiSchema);
  const copy: any = {};
  for (const key of Object.keys(schema)) {
    if (key === '$schema' || key === 'additionalProperties' || key === '$ref' || key === 'definitions') continue;
    if (key === 'const') {
      copy['enum'] = [schema['const']];
      continue;
    }
    copy[key] = cleanGeminiSchema(schema[key]);
  }
  return copy;
}

export async function parseWithProvider(message: string, signal: AbortSignal): Promise<Intent> {
  if (env.AI_PROVIDER === 'none') return { kind: 'unknown' };
  if (env.AI_PROVIDER === 'openai') {
    const url = `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.OPENAI_MODEL!,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: message },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'jarvis_intent', strict: true, schema: jsonSchema } },
      }),
    });
    if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    const text = textFromOpenAI(body);
    if (!text) throw new Error('OPENAI_EMPTY');
    return intentSchema.parse(JSON.parse(text));
  }
  const url = `${env.GEMINI_BASE_URL.replace(/\/$/, '')}/models/${env.GEMINI_MODEL!}:generateContent?key=${env.GEMINI_API_KEY!}`;
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: message }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: cleanGeminiSchema(jsonSchema) },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  const text = textFromGemini(body);
  if (!text) throw new Error('GEMINI_EMPTY');
  try {
    const json = JSON.parse(text);
    const parsed = intentSchema.safeParse(json);
    if (parsed.success) return parsed.data;

    if (json.kind === 'patient_lookup' || json.patient) {
      return {
        kind: 'patient_lookup',
        query: String(json.query || json.name || json.patient || message),
        lookupType: (json.lookupType as any) || 'auto',
      };
    }
    if (json.kind === 'inventory_search' || json.inventory) {
      return { kind: 'inventory_search', query: String(json.query || message) };
    }
    if (json.kind === 'low_stock' || json.low_stock) {
      return { kind: 'low_stock' };
    }
    if (json.kind === 'greeting' || json.greeting) {
      return { kind: 'greeting' };
    }
    if (json.kind === 'queue' || json.queue) {
      return { kind: 'queue', mode: (json.mode as any) || 'remaining' };
    }
    return { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}
