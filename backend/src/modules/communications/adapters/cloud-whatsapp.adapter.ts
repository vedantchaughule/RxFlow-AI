import { WhatsAppAdapterError, type SendTemplateRequest, type SendTemplateResult, type WhatsAppAdapter } from './whatsapp-adapter.js';

type CloudAdapterConfig = {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  fetcher?: typeof fetch;
};

export class CloudWhatsAppAdapter implements WhatsAppAdapter {
  readonly kind = 'cloud' as const;
  readonly label = 'WhatsApp Cloud API';
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: CloudAdapterConfig) {
    this.fetcher = config.fetcher ?? fetch;
  }

  async sendTemplate(request: SendTemplateRequest): Promise<SendTemplateResult> {
    const entries = Object.entries(request.parameters);
    const parameters = entries.map(([name, value]) => ({
      type: 'text',
      ...(request.template.parameterFormat === 'named' ? { parameter_name: name } : {}),
      text: value,
    }));
    let response: Response;
    try {
      response = await this.fetcher(`https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to: request.to, type: 'template',
          template: { name: request.template.name, language: { code: request.template.language }, ...(parameters.length ? { components: [{ type: 'body', parameters }] } : {}) },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new WhatsAppAdapterError('WHATSAPP_PROVIDER_UNAVAILABLE', true);
    }
    if (!response.ok) throw new WhatsAppAdapterError(response.status >= 500 || response.status === 429 ? 'WHATSAPP_PROVIDER_UNAVAILABLE' : 'WHATSAPP_PROVIDER_REJECTED', response.status >= 500 || response.status === 429);
    const payload = await response.json() as { messages?: Array<{ id?: string }> };
    const providerMessageId = payload.messages?.[0]?.id;
    if (!providerMessageId) throw new WhatsAppAdapterError('WHATSAPP_PROVIDER_INVALID_RESPONSE', true);
    return { status: 'accepted', providerMessageId };
  }
}
