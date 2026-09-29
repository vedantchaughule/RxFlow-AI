import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAIAdapter } from '../src/providers/openai-adapter.js';
import { GeminiAdapter } from '../src/providers/gemini-adapter.js';
import { ProviderError } from '../src/providers/provider-interface.js';

describe('Provider HTTP Error & Empty Response Handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('handles OpenAI HTTP 401 Unauthorized', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    const adapter = new OpenAIAdapter('synthetic-invalid-key');
    await expect(adapter.understand({ message: 'Hello' })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' })).rejects.toMatchObject({
      code: 'HTTP_401',
      status: 401,
      provider: 'openai',
    });
  });

  it('handles Gemini HTTP 500 Internal Server Error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Error',
    } as Response);

    const adapter = new GeminiAdapter('synthetic-test-key');
    await expect(adapter.understand({ message: 'Hello' })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' })).rejects.toMatchObject({
      code: 'HTTP_500',
      status: 500,
      provider: 'gemini',
    });
  });

  it('handles empty response payload from OpenAI', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    } as Response);

    const adapter = new OpenAIAdapter('synthetic-test-key');
    await expect(adapter.understand({ message: 'Hello' })).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
      provider: 'openai',
    });
  });

  it('handles empty candidate payload from Gemini', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [] }),
    } as Response);

    const adapter = new GeminiAdapter('synthetic-test-key');
    await expect(adapter.understand({ message: 'Hello' })).rejects.toMatchObject({
      code: 'EMPTY_RESPONSE',
      provider: 'gemini',
    });
  });
});
