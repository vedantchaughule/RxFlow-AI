import { env } from '../env.js';
import type { ProviderType } from '../types.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { NoneAdapter } from './none-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import type { ProviderAdapter } from './provider-interface.js';

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private readonly adapters: Map<ProviderType, ProviderAdapter> = new Map();

  private constructor() {
    this.registerAdapter(new NoneAdapter());

    if (env.OPENAI_API_KEY) {
      try {
        this.registerAdapter(new OpenAIAdapter(env.OPENAI_API_KEY, env.OPENAI_MODEL, env.OPENAI_BASE_URL));
      } catch {
        // Fallback gracefully if construction fails
      }
    }

    if (env.GEMINI_API_KEY) {
      try {
        this.registerAdapter(new GeminiAdapter(env.GEMINI_API_KEY, env.GEMINI_MODEL, env.GEMINI_BASE_URL));
      } catch {
        // Fallback gracefully if construction fails
      }
    }
  }

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  public registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  public getProvider(type?: ProviderType): ProviderAdapter {
    const requested = type ?? env.AI_PROVIDER;
    const adapter = this.adapters.get(requested);
    if (adapter) {
      return adapter;
    }
    // Fallback to none adapter if requested provider is not registered or missing credentials
    return this.adapters.get('none')!;
  }
}

export function getProvider(type?: ProviderType): ProviderAdapter {
  return ProviderRegistry.getInstance().getProvider(type);
}
