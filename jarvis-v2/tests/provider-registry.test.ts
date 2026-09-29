import { describe, it, expect } from 'vitest';
import { NoneAdapter } from '../src/providers/none-adapter.js';
import { ProviderRegistry, getProvider } from '../src/providers/provider-registry.js';
import type { ProviderAdapter } from '../src/providers/provider-interface.js';
import type { ProviderInput, ProviderOutput } from '../src/types.js';

class DummyAdapter implements ProviderAdapter {
  public readonly name = 'none' as const;
  public async understand(input: ProviderInput): Promise<ProviderOutput> {
    return {
      intent: { kind: 'greeting' },
      assistantText: `Dummy response for ${input.message}`,
      providerName: 'none',
    };
  }
}

describe('Provider Registry', () => {
  it('returns NoneAdapter by default when no key is set', () => {
    const provider = getProvider('none');
    expect(provider).toBeInstanceOf(NoneAdapter);
    expect(provider.name).toBe('none');
  });

  it('falls back to NoneAdapter when requesting unconfigured provider', () => {
    const provider = getProvider('openai');
    // If OPENAI_API_KEY is not set in env, it should fall back to none adapter
    expect(provider.name).toBe('none');
  });

  it('allows registering custom adapters', () => {
    const registry = ProviderRegistry.getInstance();
    const dummy = new DummyAdapter();
    registry.registerAdapter(dummy);

    const retrieved = registry.getProvider('none');
    expect(retrieved).toBe(dummy);
  });
});
