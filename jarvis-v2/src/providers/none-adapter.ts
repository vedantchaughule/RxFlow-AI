import { parseLocalIntent } from '../parser/local-parser.js';
import type { ProviderInput, ProviderOutput, ProviderType } from '../types.js';
import { MAX_INPUT_LENGTH } from '../types.js';
import type { ProviderAdapter, ProviderAdapterOptions } from './provider-interface.js';
import { ProviderError } from './provider-interface.js';

export class NoneAdapter implements ProviderAdapter {
  public readonly name: ProviderType = 'none';

  public async understand(input: ProviderInput, options?: ProviderAdapterOptions): Promise<ProviderOutput> {
    if (options?.signal?.aborted) {
      throw new ProviderError('none', 'ABORTED', 'Request was aborted before execution');
    }

    let message = input.message ?? '';
    if (message.length > MAX_INPUT_LENGTH) {
      message = message.substring(0, MAX_INPUT_LENGTH);
    }

    const intent = parseLocalIntent(message);

    return {
      intent,
      assistantText: 'Deterministic local intelligence parser output',
      rawConfidence: 1.0,
      providerName: 'none',
    };
  }
}
