import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Maximize2,
  Printer,
  QrCode,
  RotateCcw,
  ShieldAlert,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { client, errorMessage } from '../../api';
import { notify as toast } from '../../ui/Feedback';
import { Page } from '../../ui/Page';
import { LoadingSkeleton, StateView } from '../../ui/States';
import { pdfBlobFromArrayBuffer } from './pdf-blob';

type ShareLinkData = {
  id: string;
  status: 'active' | 'expired' | 'revoked' | 'access_limit_reached';
  expiresAt: string;
  maxViews: number;
  viewCount: number;
  createdAt: string;
};

type TimelineEvent = {
  id: string;
  action: string;
  title: string;
  timestamp: string;
  description: string;
};

type AccessStatusData = {
  prescriptionId: string;
  pdfStatus: string;
  accessStatus: string;
  activeLink: ShareLinkData | null;
  url?: string;
  qrCodeDataUrl?: string;
  timeline: TimelineEvent[];
};

type AccessGenerationResult = {
  shareLink: ShareLinkData;
  url: string;
  qrCodeDataUrl: string;
  rawToken: string;
};

export function PrescriptionWorkspace() {
  const { id: prescriptionId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [zoom, setZoom] = useState(100);
  const [showQrModal, setShowQrModal] = useState(false);
  const [accessData, setAccessData] = useState<AccessGenerationResult | null>(null);

  const statusQuery = useQuery({
    queryKey: ['prescription-access-status', prescriptionId],
    enabled: Boolean(prescriptionId),
    queryFn: async () => {
      const res = await client.get(`/prescriptions/${prescriptionId}/access-status`);
      return res.data.data as AccessStatusData;
    },
  });

  const pdfQuery = useQuery({
    queryKey: ['prescription-pdf-blob', prescriptionId],
    enabled: Boolean(prescriptionId),
    queryFn: async () => {
      const res = await client.get<ArrayBuffer>(`/prescriptions/${prescriptionId}/pdf`, { responseType: 'arraybuffer' });
      return URL.createObjectURL(pdfBlobFromArrayBuffer(res.data));
    },
  });

  const generateAccessMutation = useMutation({
    mutationFn: async () => {
      const res = await client.post(`/prescriptions/${prescriptionId}/share-links`);
      return res.data.data as AccessGenerationResult;
    },
    onSuccess: (data) => {
      setAccessData(data);
      toast.success('Patient access is ready');
      void queryClient.invalidateQueries({ queryKey: ['prescription-access-status', prescriptionId] });
    },
    onError: (err) => {
      toast.error(errorMessage(err));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareLinkId: string) => {
      const res = await client.post(`/prescriptions/${prescriptionId}/share-links/${shareLinkId}/revoke`);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Patient access revoked');
      setAccessData(null);
      void queryClient.invalidateQueries({ queryKey: ['prescription-access-status', prescriptionId] });
    },
    onError: (err) => {
      toast.error(errorMessage(err));
    },
  });

  const handleCopyLink = () => {
    const linkUrl = accessData?.url || statusQuery.data?.url;
    if (!linkUrl) {
      toast.error('No active link URL available');
      return;
    }
    void navigator.clipboard.writeText(linkUrl);
    toast.success('Secure link copied to clipboard');
  };

  const handleDownloadQr = () => {
    const qrUrl = accessData?.qrCodeDataUrl || statusQuery.data?.qrCodeDataUrl;
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = 'rxflow-prescription-access.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Downloaded QR image');
  };

  const handlePrintQr = () => {
    const qrUrl = accessData?.qrCodeDataUrl || statusQuery.data?.qrCodeDataUrl;
    if (!qrUrl) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<html><head><title>Print QR Code</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;"><img src="${qrUrl}" style="max-width:80%;" onload="window.print();window.close();"/></body></html>`);
      win.document.close();
    }
  };

  const handleDownloadClinicCopy = async () => {
    try {
      const res = await client.get<ArrayBuffer>(`/prescriptions/${prescriptionId}/pdf/download`, { responseType: 'arraybuffer' });
      const url = URL.createObjectURL(pdfBlobFromArrayBuffer(res.data));
      const a = document.createElement('a');
      a.href = url;
      a.download = `rxflow-prescription-${prescriptionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Downloaded clinic copy');
    } catch (err) {
      toast.error('Failed to download clinic copy');
    }
  };

  if (statusQuery.isLoading) {
    return (
      <Page title="Prescription Workspace" subtitle="Loading workspace controls…">
        <LoadingSkeleton label="Loading workspace" rows={6} />
      </Page>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <Page title="Prescription Workspace" subtitle="Unable to load prescription.">
        <StateView kind="error" title="Prescription Unavailable" message={errorMessage(statusQuery.error)} />
      </Page>
    );
  }

  const status = statusQuery.data;
  const activeLink = status.activeLink;
  const effectiveUrl = accessData?.url || status.url;
  const effectiveQrCodeUrl = accessData?.qrCodeDataUrl || status.qrCodeDataUrl;

  return (
    <Page
      title={`Prescription RXF-${prescriptionId?.slice(-6).toUpperCase()}`}
      subtitle="Desktop prescription workspace & secure patient access delivery"
      action={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="button ghost small" onClick={() => navigate('/app/queue')}>
            <ArrowLeft size={16} /> Return to queue
          </button>
          <button className="button ghost small" onClick={() => navigate('/app/patients')}>
            <User size={16} /> Return to patient
          </button>
        </div>
      }
    >
      <div
        className="prescription-desktop-workspace"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 420px',
          gap: '24px',
          minHeight: '720px',
          alignItems: 'start',
        }}
      >
        {/* LEFT PANEL: PDF Preview & Controls */}
        <section
          className="left-panel"
          style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '12px',
            border: '1px solid var(--border-color, #e5e7eb)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={20} color="#2563eb" />
              <strong style={{ fontSize: '15px' }}>Prescription PDF Preview</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="button ghost small icon-only"
                title="Zoom out"
                onClick={() => setZoom((z) => Math.max(50, z - 10))}
              >
                <ZoomOut size={16} />
              </button>
              <span style={{ fontSize: '13px', minWidth: '42px', textAlign: 'center' }}>{zoom}%</span>
              <button
                className="button ghost small icon-only"
                title="Zoom in"
                onClick={() => setZoom((z) => Math.min(150, z + 10))}
              >
                <ZoomIn size={16} />
              </button>
              <button className="button ghost small icon-only" title="Reset zoom" onClick={() => setZoom(100)}>
                <RotateCcw size={15} />
              </button>
              <button
                className="button ghost small"
                onClick={() => pdfQuery.data && window.open(pdfQuery.data, '_blank')}
                title="Print preview"
              >
                <Printer size={16} /> Print preview
              </button>
            </div>
          </div>

          <div
            style={{
              background: '#374151',
              borderRadius: '8px',
              height: '600px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              padding: '16px',
            }}
          >
            {pdfQuery.isLoading ? (
              <p style={{ color: '#ffffff' }}>Loading PDF previewâ€¦</p>
            ) : pdfQuery.isError || !pdfQuery.data ? (
              <div style={{ textAlign: 'center', color: '#f87171' }}>
                <AlertTriangle size={32} style={{ margin: '0 auto 8px' }} />
                <p>PDF generation failed</p>
                <button className="button small" onClick={() => void pdfQuery.refetch()}>
                  Retry PDF generation
                </button>
              </div>
            ) : (
              <iframe
                src={pdfQuery.data}
                title="Prescription PDF Document"
                style={{
                  width: `${zoom}%`,
                  height: '100%',
                  border: 'none',
                  borderRadius: '4px',
                  background: '#ffffff',
                  transition: 'width 0.2s ease',
                }}
              />
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="button ghost small" onClick={handleDownloadClinicCopy}>
              <Download size={16} /> Download clinic copy
            </button>
            <span style={{ fontSize: '12px', color: '#6b7280' }}>Doctor authenticated view</span>
          </div>
        </section>

        {/* RIGHT PANEL: Status, Access Controls, QR Code & Timeline */}
        <section
          className="right-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Status Card */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '20px',
            }}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: '#111827' }}>Status & Link Controls</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: '#f9fafb', padding: '10px 12px', borderRadius: '8px' }}>
                <small style={{ color: '#6b7280', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>PDF Status</small>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <CheckCircle2 size={14} /> {status.pdfStatus}
                </span>
              </div>

              <div style={{ background: '#f9fafb', padding: '10px 12px', borderRadius: '8px' }}>
                <small style={{ color: '#6b7280', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Access Status</small>
                <span style={{ fontSize: '13px', fontWeight: 600, color: status.accessStatus === 'Active' ? '#2563eb' : '#6b7280', marginTop: '2px', display: 'block' }}>
                  {status.accessStatus}
                </span>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              className="button full"
              disabled={generateAccessMutation.isPending}
              onClick={() => generateAccessMutation.mutate()}
              style={{ padding: '12px', fontSize: '14px', fontWeight: 600 }}
            >
              {generateAccessMutation.isPending
                ? 'Generating secure accessâ€¦'
                : activeLink || accessData
                ? 'Generate replacement link'
                : 'Generate patient access'}
            </button>

            {/* Link details if active or generated */}
            {(accessData || activeLink) && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <small style={{ color: '#6b7280' }}>Expires: {new Date(accessData?.shareLink.expiresAt ?? activeLink?.expiresAt ?? '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                  <small style={{ color: '#6b7280' }}>Views: {accessData?.shareLink.viewCount ?? activeLink?.viewCount ?? 0} / {accessData?.shareLink.maxViews ?? activeLink?.maxViews ?? 20}</small>
                </div>

                {/* 12 Action Buttons Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                  <button className="button ghost small" onClick={() => pdfQuery.data && window.open(pdfQuery.data, '_blank')}>
                    <Eye size={15} /> Preview PDF
                  </button>

                  <button className="button ghost small" onClick={() => setShowQrModal(true)} disabled={!effectiveQrCodeUrl}>
                    <QrCode size={15} /> Show QR code
                  </button>

                  <button className="button ghost small" onClick={handleCopyLink} disabled={!effectiveUrl}>
                    <Copy size={15} /> Copy secure link
                  </button>

                  <button className="button ghost small" onClick={() => effectiveUrl && window.open(effectiveUrl, '_blank')} disabled={!effectiveUrl}>
                    <ExternalLink size={15} /> Open patient page
                  </button>

                  <button className="button ghost small" onClick={handleDownloadQr} disabled={!effectiveQrCodeUrl}>
                    <Download size={15} /> Download QR image
                  </button>

                  <button className="button ghost small" onClick={handlePrintQr} disabled={!effectiveQrCodeUrl}>
                    <Printer size={15} /> Print QR
                  </button>

                  {(activeLink?.id || accessData?.shareLink.id) && (
                    <button
                      className="button ghost small danger"
                      style={{ gridColumn: 'span 2', color: '#dc2626' }}
                      onClick={() => revokeMutation.mutate(accessData?.shareLink.id ?? activeLink!.id)}
                      disabled={revokeMutation.isPending}
                    >
                      <ShieldAlert size={15} /> Revoke link
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* QR Code Display Card */}
          {effectiveQrCodeUrl && (
            <div
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                padding: '20px',
                textAlign: 'center',
              }}
            >
              <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 12px' }}>Patient Access QR Code</h4>
              <img
                src={effectiveQrCodeUrl}
                alt="Patient Prescription QR Code"
                style={{ width: '180px', height: '180px', margin: '0 auto 12px', border: '1px solid #f3f4f6', borderRadius: '8px' }}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px' }}>
                Scan to open the secure prescription landing page on patient mobile.
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button className="button ghost small" onClick={() => setShowQrModal(true)}>
                  <Maximize2 size={14} /> Enlarge QR
                </button>
              </div>
            </div>
          )}

          {/* Prescription Access Timeline */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '20px',
            }}
          >
            <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} /> Prescription Access Timeline
            </h4>

            {status.timeline.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#9ca3af' }}>No timeline events recorded yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {status.timeline.map((event) => (
                  <div key={event.id} style={{ borderLeft: '2px solid #3b82f6', paddingLeft: '12px', position: 'relative' }}>
                    <strong style={{ fontSize: '13px', color: '#111827', display: 'block' }}>{event.title}</strong>
                    <small style={{ fontSize: '11px', color: '#6b7280' }}>
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </small>
                    <p style={{ fontSize: '12px', color: '#4b5563', margin: '2px 0 0' }}>{event.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* QR Code Enlarged Modal */}
      {showQrModal && effectiveQrCodeUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '420px',
              width: '90%',
              textAlign: 'center',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQrModal(false)}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Patient Access QR Code</h3>
            <img src={effectiveQrCodeUrl} alt="Enlarged QR Code" style={{ width: '280px', height: '280px', margin: '0 auto 16px' }} />
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
              Show this QR code to the patient to scan with their mobile camera or Google Lens.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="button small" onClick={handleDownloadQr}>
                <Download size={16} /> Download image
              </button>
              <button className="button ghost small" onClick={handlePrintQr}>
                <Printer size={16} /> Print QR
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}


