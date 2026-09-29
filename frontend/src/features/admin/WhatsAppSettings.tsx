import { AlertCircle, CheckCircle2, MessageCircle } from 'lucide-react';
import type { Clinic } from '../../types';

export function WhatsAppSettings({ clinic }: { clinic: Clinic }) {
  const config = clinic.whatsappConfig;
  const ready = config?.isConfigured === true;
  return <>
    <section className="panel settings-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><p className="eyebrow"><MessageCircle size={14} /> WhatsApp integration</p><h2>{ready ? 'WhatsApp Cloud API' : 'WhatsApp Cloud API is not configured.'}</h2></div>
        <span className="status-badge" style={{ background: ready ? '#ccfbf1' : '#fef3c7', color: ready ? '#0f766e' : '#92400e', padding: '6px 12px', borderRadius: 6, fontWeight: 600, fontSize: '.85rem' }}>{ready ? <><CheckCircle2 size={14} style={{ display: 'inline', marginRight: 4 }} /> Cloud API active</> : <><AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} /> Configuration needed</>}</span>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>Credentials are server-only environment settings and are never entered, stored, or exposed in this browser.</p>
      <div className="form-grid"><label>Graph API version<input readOnly value={config?.apiVersion ?? 'v26.0'} /></label><label>Phone Number ID<input readOnly value={config?.phoneNumberId ?? 'Not configured'} /></label><label>Business Account ID<input readOnly value={config?.whatsappBusinessAccountId ?? 'Not configured'} /></label></div>
      <p className="muted">Configure <code>WHATSAPP_PROVIDER=cloud</code> and the official Cloud API values on the backend, then register approved Meta utility templates below.</p>
    </section>
  </>;
}
