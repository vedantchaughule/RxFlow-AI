import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAIAdapter } from '../src/providers/openai-adapter.js';
import { GeminiAdapter } from '../src/providers/gemini-adapter.js';
import { ProviderError } from '../src/providers/provider-interface.js';

describe('Provider Timeout & Abort Handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects immediately when passed an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const adapter = new OpenAIAdapter('synthetic-test-key-12345');
    await expect(adapter.understand({ message: 'Hello' }, { signal: controller.signal })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' }, { signal: controller.signal })).rejects.toMatchObject({
      code: 'ABORTED',
    });
  });

  it('times out when network fetch hangs past timeoutMs', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const adapter = new OpenAIAdapter('synthetic-test-key-12345');
    await expect(adapter.understand({ message: 'Hello' }, { timeoutMs: 50 })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' }, { timeoutMs: 50 })).rejects.toMatchObject({
      code: 'TIMEOUT',
      provider: 'openai',
    });
  });

  it('handles Gemini timeout correctly', async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal as AbortSignal | undefined;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    });

    const adapter = new GeminiAdapter('synthetic-test-key-12345');
    await expect(adapter.understand({ message: 'Hello' }, { timeoutMs: 50 })).rejects.toThrow(ProviderError);
    await expect(adapter.understand({ message: 'Hello' }, { timeoutMs: 50 })).rejects.toMatchObject({
      code: 'TIMEOUT',
      provider: 'gemini',
    });
  });
});
