import { intentSchema, INTENT_JSON_SCHEMA, MAX_INPUT_LENGTH, DEFAULT_TIMEOUT_MS } from '../types.js';
import type { ProviderInput, ProviderOutput, ProviderType } from '../types.js';
import type { ProviderAdapter, ProviderAdapterOptions } from './provider-interface.js';
import { ProviderError } from './provider-interface.js';

const systemPrompt = `You are an intent parser for a doctor-supervised clinic assistant.
Return ONLY valid JSON matching the requested schema.
Never invent patient data, queue records, inventory items, or prescription details.
Do not diagnose patients independently or claim prescriptions are "medically correct".`;

export class OpenAIAdapter implements ProviderAdapter {
  public readonly name: ProviderType = 'openai';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(apiKey?: string, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1') {
    if (!apiKey) {
      throw new ProviderError('openai', 'MISSING_API_KEY', 'OpenAI API key is required');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async understand(input: ProviderInput, options?: ProviderAdapterOptions): Promise<ProviderOutput> {
    if (options?.signal?.aborted) {
      throw new ProviderError('openai', 'ABORTED', 'Request was aborted before execution');
    }

    let message = input.message ?? '';
    if (message.length > MAX_INPUT_LENGTH) {
      message = message.substring(0, MAX_INPUT_LENGTH);
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      options.signal.addEventListener('abort', onExternalAbort);
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'jarvis_intent', strict: true, schema: INTENT_JSON_SCHEMA },
          },
        }),
      });

      if (!response.ok) {
        throw new ProviderError('openai', `HTTP_${response.status}`, `OpenAI returned status ${response.status}`, response.status);
      }

      const body = (await response.json()) as Record<string, unknown>;
      const text = this.extractContent(body);

      if (!text) {
        throw new ProviderError('openai', 'EMPTY_RESPONSE', 'OpenAI returned empty message content');
      }

      let rawJson: unknown;
      try {
        rawJson = JSON.parse(text);
      } catch (err: any) {
        throw new ProviderError('openai', 'INVALID_STRUCTURED_OUTPUT', `Failed to parse OpenAI JSON response: ${err.message}`);
      }

      const parsed = intentSchema.safeParse(rawJson);
      if (!parsed.success) {
        throw new ProviderError('openai', 'INVALID_STRUCTURED_OUTPUT', `Schema validation failed for OpenAI response: ${parsed.error.message}`);
      }

      return {
        intent: parsed.data,
        assistantText: 'OpenAI intelligence parser output',
        providerName: 'openai',
      };
    } catch (err: any) {
      if (err instanceof ProviderError) {
        throw err;
      }
      if (err.name === 'AbortError' || controller.signal.aborted) {
        throw new ProviderError('openai', 'TIMEOUT', `OpenAI request timed out after ${timeoutMs}ms`);
      }
      throw new ProviderError('openai', 'NETWORK_ERROR', err.message || 'Unknown network error');
    } finally {
      clearTimeout(timer);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private extractContent(body: Record<string, unknown>): string | undefined {
    const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
    return choices?.[0]?.message?.content;
  }
}
