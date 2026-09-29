import type { ProviderInput, ProviderOutput, ProviderType } from '../types.js';

export interface ProviderAdapterOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class ProviderError extends Error {
  public readonly provider: ProviderType;
  public readonly code: string;
  public readonly status?: number;

  constructor(provider: ProviderType, code: string, message: string, status?: number) {
    super(ProviderError.maskSecrets(message));
    this.name = 'ProviderError';
    this.provider = provider;
    this.code = code;
    this.status = status;
  }

  public static maskSecrets(text: string): string {
    return text
      .replace(/sk-[A-Za-z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
      .replace(/AIzaSy[A-Za-z0-9_-]{30,}/g, '[REDACTED_API_KEY]')
      .replace(/(?:key|apiKey|token|secret)=([^&\s]+)/gi, '$1=[REDACTED]');
  }
}

export interface ProviderAdapter {
  readonly name: ProviderType;
  understand(input: ProviderInput, options?: ProviderAdapterOptions): Promise<ProviderOutput>;
}
