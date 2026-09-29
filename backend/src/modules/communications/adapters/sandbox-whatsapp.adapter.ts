import type { SendTemplateRequest, SendTemplateResult, WhatsAppAdapter } from './whatsapp-adapter.js';

export class SandboxWhatsAppAdapter implements WhatsAppAdapter {
  readonly kind = 'sandbox' as const;
  readonly label = 'Development sandbox — records requests only; no messages are delivered';

  async sendTemplate(_request: SendTemplateRequest): Promise<SendTemplateResult> {
    return { status: 'sandbox_recorded', providerMessageId: undefined };
  }
}
