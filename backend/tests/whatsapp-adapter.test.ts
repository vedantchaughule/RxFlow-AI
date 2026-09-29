import { describe, expect, it, vi } from 'vitest';
import { CloudWhatsAppAdapter } from '../src/modules/communications/adapters/cloud-whatsapp.adapter.js';
import { SandboxWhatsAppAdapter } from '../src/modules/communications/adapters/sandbox-whatsapp.adapter.js';
import { CommunicationMessageModel } from '../src/modules/communications/communication-message.model.js';

const request = {
  to: '+919876543210',
  template: { name: 'appointment_confirmation', language: 'en_US', parameterFormat: 'named' as const },
  parameters: { patient_name: 'Priya', appointment_time: '5 Aug, 10:00 AM' },
};

describe('WhatsApp adapters', () => {
  it('keeps queued template parameters persisted but excluded from normal reads', () => {
    expect(CommunicationMessageModel.schema.path('parameterValues')).toBeDefined();
    expect(CommunicationMessageModel.schema.path('parameterValues').options.select).toBe(false);
  });

  it('records sandbox sends without claiming provider acceptance or delivery', async () => {
    const adapter = new SandboxWhatsAppAdapter();
    const result = await adapter.sendTemplate(request);
    expect(result).toEqual({ status: 'sandbox_recorded', providerMessageId: undefined });
    expect(adapter.label).toContain('Development sandbox');
  });

  it('sends an approved template through the configured current Graph API version', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.test' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const adapter = new CloudWhatsAppAdapter({ apiVersion: 'v26.0', phoneNumberId: '123456789', accessToken: 'write-only-token', fetcher });
    const result = await adapter.sendTemplate(request);
    expect(result).toEqual({ status: 'accepted', providerMessageId: 'wamid.test' });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v26.0/123456789/messages');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer write-only-token' });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ messaging_product: 'whatsapp', type: 'template', template: { name: 'appointment_confirmation' } });
  });

  it('treats provider rejection as retryable without exposing provider response bodies', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ error: { message: 'secret provider detail' } }), { status: 503 }));
    const adapter = new CloudWhatsAppAdapter({ apiVersion: 'v26.0', phoneNumberId: '123456789', accessToken: 'write-only-token', fetcher });
    await expect(adapter.sendTemplate(request)).rejects.toMatchObject({ retryable: true, safeCode: 'WHATSAPP_PROVIDER_UNAVAILABLE' });
  });
});
