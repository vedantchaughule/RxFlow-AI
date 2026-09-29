import { intentSchema, INTENT_JSON_SCHEMA, MAX_INPUT_LENGTH, DEFAULT_TIMEOUT_MS } from '../types.js';
import type { ProviderInput, ProviderOutput, ProviderType } from '../types.js';
import type { ProviderAdapter, ProviderAdapterOptions } from './provider-interface.js';
import { ProviderError } from './provider-interface.js';

const systemPrompt = `You are an intent parser for a doctor-supervised clinic assistant.
Return ONLY valid JSON matching the requested schema.
Never invent patient data, queue records, inventory items, or prescription details.
Do not diagnose patients independently or claim prescriptions are "medically correct".`;

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

export class GeminiAdapter implements ProviderAdapter {
  public readonly name: ProviderType = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, model = 'gemini-2.5-flash', baseUrl = 'https://generativelanguage.googleapis.com/v1beta') {
    if (!apiKey) {
      throw new ProviderError('gemini', 'MISSING_API_KEY', 'Gemini API key is required');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async understand(input: ProviderInput, options?: ProviderAdapterOptions): Promise<ProviderOutput> {
    if (options?.signal?.aborted) {
      throw new ProviderError('gemini', 'ABORTED', 'Request was aborted before execution');
    }

    let message = input.message ?? '';
    if (message.length > MAX_INPUT_LENGTH) {
      message = message.substring(0, MAX_INPUT_LENGTH);
    }

    const geminiSchema = cleanGeminiSchema(INTENT_JSON_SCHEMA);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      options.signal.addEventListener('abort', onExternalAbort);
    }

    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-goog-api-key': this.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: geminiSchema,
          },
        }),
      });

      if (!response.ok) {
        throw new ProviderError('gemini', `HTTP_${response.status}`, `Gemini returned status ${response.status}`, response.status);
      }

      const body = (await response.json()) as Record<string, unknown>;
      const text = this.extractContent(body);

      if (!text) {
        throw new ProviderError('gemini', 'EMPTY_RESPONSE', 'Gemini returned empty candidate content');
      }

      let rawJson: unknown;
      try {
        rawJson = JSON.parse(text);
      } catch (err: any) {
        throw new ProviderError('gemini', 'INVALID_STRUCTURED_OUTPUT', `Failed to parse Gemini JSON response: ${err.message}`);
      }

      const parsed = intentSchema.safeParse(rawJson);
      if (!parsed.success) {
        throw new ProviderError('gemini', 'INVALID_STRUCTURED_OUTPUT', `Schema validation failed for Gemini response: ${parsed.error.message}`);
      }

      return {
        intent: parsed.data,
        assistantText: 'Gemini intelligence parser output',
        providerName: 'gemini',
      };
    } catch (err: any) {
      if (err instanceof ProviderError) {
        throw err;
      }
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new ProviderError('gemini', 'TIMEOUT', `Gemini request timed out after ${timeoutMs}ms`);
      }
      throw new ProviderError('gemini', 'NETWORK_ERROR', err.message || 'Unknown network error');
    } finally {
      clearTimeout(timer);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private extractContent(body: Record<string, unknown>): string | undefined {
    const candidates = body.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    return candidates?.[0]?.content?.parts?.[0]?.text;
  }
}
