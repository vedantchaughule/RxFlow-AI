import { describe, it, expect, vi, afterEach } from 'vitest';
import { GeminiAdapter } from '../src/providers/gemini-adapter.js';
import { OpenAIAdapter } from '../src/providers/openai-adapter.js';
import { ProviderError } from '../src/providers/provider-interface.js';

describe('Invalid Structured Output Handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('throws ProviderError INVALID_STRUCTURED_OUTPUT when OpenAI returns non-JSON text', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Not a JSON object' } }],
      }),
    } as Response);

    const adapter = new OpenAIAdapter('synthetic-test-key-12345');

    await expect(adapter.understand({ message: 'Hello' })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' })).rejects.toMatchObject({
      code: 'INVALID_STRUCTURED_OUTPUT',
      provider: 'openai',
    });
  });

  it('throws ProviderError INVALID_STRUCTURED_OUTPUT when OpenAI returns JSON violating intent schema', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ kind: 'non_existent_kind' }) } }],
      }),
    } as Response);

    const adapter = new OpenAIAdapter('synthetic-test-key-12345');

    await expect(adapter.understand({ message: 'Hello' })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' })).rejects.toMatchObject({
      code: 'INVALID_STRUCTURED_OUTPUT',
      provider: 'openai',
    });
  });

  it('throws ProviderError INVALID_STRUCTURED_OUTPUT when Gemini returns malformed output', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Invalid JSON string' }] } }],
      }),
    } as Response);

    const adapter = new GeminiAdapter('synthetic-test-key-12345');

    await expect(adapter.understand({ message: 'Hello' })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' })).rejects.toMatchObject({
      code: 'INVALID_STRUCTURED_OUTPUT',
      provider: 'gemini',
    });
  });
});
