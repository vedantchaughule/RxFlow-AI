export type TemplateParameterFormat = 'named' | 'positional';

export type SendTemplateRequest = {
  to: string;
  template: { name: string; language: string; parameterFormat: TemplateParameterFormat };
  parameters: Record<string, string>;
};

export type SendTemplateResult = {
  status: 'accepted' | 'sandbox_recorded';
  providerMessageId?: string;
};

export interface WhatsAppAdapter {
  readonly kind: 'cloud' | 'sandbox';
  readonly label: string;
  sendTemplate(request: SendTemplateRequest): Promise<SendTemplateResult>;
}

export class WhatsAppAdapterError extends Error {
  constructor(public readonly safeCode: string, public readonly retryable: boolean) {
    super(safeCode);
    this.name = 'WhatsAppAdapterError';
  }
}
