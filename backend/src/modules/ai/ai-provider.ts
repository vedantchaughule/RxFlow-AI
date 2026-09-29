export type ProviderName = 'openai' | 'gemini' | 'anthropic';
export type ProviderRequest = { model: string; system: string; input: string; schema: Record<string, unknown>; signal: AbortSignal };
export type ProviderResult = { json: unknown; inputTokens?: number; outputTokens?: number; estimatedCostMicros?: number };
export interface AiProvider { readonly name: ProviderName; generate(request: ProviderRequest): Promise<ProviderResult>; }

type Config = { provider: ProviderName; baseUrl: string; apiKey: string };
const join = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;
async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
  return await response.json() as Record<string, unknown>;
}

export function createHttpProvider(config: Config): AiProvider {
  return {
    name: config.provider,
    async generate(request) {
      if (config.provider === 'openai') {
        const body = await jsonResponse(await fetch(join(config.baseUrl, '/responses'), { method: 'POST', signal: request.signal, headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: request.model, store: false, instructions: request.system, input: request.input, text: { format: { type: 'json_schema', name: 'rxflow_ai_draft', strict: true, schema: request.schema } } }) }));
        const output = body.output as Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined;
        const text = output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
        const usage = body.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (!text) throw new Error('AI_PROVIDER_EMPTY');
        return { json: JSON.parse(text), inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
      }
      if (config.provider === 'gemini') {
        const body = await jsonResponse(await fetch(join(config.baseUrl, '/interactions'), { method: 'POST', signal: request.signal, headers: { 'x-goog-api-key': config.apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ model: request.model, input: `${request.system}\n\n${request.input}`, response_format: { type: 'text', mime_type: 'application/json', schema: request.schema } }) }));
        const text = body.output_text as string | undefined;
        const usage = body.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (!text) throw new Error('AI_PROVIDER_EMPTY');
        return { json: JSON.parse(text), inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
      }
      const body = await jsonResponse(await fetch(join(config.baseUrl, '/messages'), { method: 'POST', signal: request.signal, headers: { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: request.model, max_tokens: 2048, system: request.system, messages: [{ role: 'user', content: request.input }], output_config: { format: { type: 'json_schema', schema: request.schema } } }) }));
      const text = (body.content as Array<{ type?: string; text?: string }> | undefined)?.find((item) => item.type === 'text')?.text;
      const usage = body.usage as { input_tokens?: number; output_tokens?: number } | undefined;
      if (!text) throw new Error('AI_PROVIDER_EMPTY');
      return { json: JSON.parse(text), inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
    },
  };
}
