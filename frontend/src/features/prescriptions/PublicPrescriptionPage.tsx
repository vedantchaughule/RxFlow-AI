import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, Eye, FileText, Phone, Printer, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { RxFlowLogo } from '../../ui/RxFlowLogo';
import { pdfBlobFromArrayBuffer } from './pdf-blob';

type SummaryData = {
  clinicName: string;
  clinicPhone: string;
  doctorName: string;
  maskedPatientName: string;
  issueDate: string;
  expiresAt: string;
  viewCount: number;
  maxViews: number;
};

export function PublicPrescriptionPage() {
  const { token } = useParams<{ token: string }>();
  const [viewPdf, setViewPdf] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';

  const summaryQuery = useQuery({
    queryKey: ['public-prescription-summary', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/public/prescriptions/${token}/summary`);
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errorData.error?.message ?? 'This prescription link is unavailable. Contact your clinic for a new link.');
      }
      const json = (await response.json()) as { data: SummaryData };
      return json.data;
    },
  });

  const handleViewPdf = async () => {
    if (pdfBlobUrl) {
      setViewPdf(true);
      return;
    }
    try {
      setLoadingPdf(true);
      const response = await fetch(`${API_BASE}/public/prescriptions/${token}/pdf`);
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errorData.error?.message ?? 'Unable to load PDF.');
      }
      const blob = pdfBlobFromArrayBuffer(await response.arrayBuffer());
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      setViewPdf(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to view PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setLoadingPdf(true);
      const response = await fetch(`${API_BASE}/public/prescriptions/${token}/pdf/download`);
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errorData.error?.message ?? 'Unable to download PDF.');
      }
      const blob = pdfBlobFromArrayBuffer(await response.arrayBuffer());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'rxflow-prescription.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handlePrint = async () => {
    if (!pdfBlobUrl) {
      try {
        setLoadingPdf(true);
        const response = await fetch(`${API_BASE}/public/prescriptions/${token}/pdf`);
        if (!response.ok) throw new Error('Unable to fetch PDF for printing');
        const blob = pdfBlobFromArrayBuffer(await response.arrayBuffer());
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
        const win = window.open(url, '_blank');
        win?.print();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to print');
      } finally {
        setLoadingPdf(false);
      }
    } else {
      const win = window.open(pdfBlobUrl, '_blank');
      win?.print();
    }
  };

  if (summaryQuery.isLoading) {
    return (
      <main className="public-prescription-page" style={{ padding: '40px 20px', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
        <RxFlowLogo size="medium" />
        <p style={{ marginTop: '24px', color: 'var(--muted-foreground, #666)' }}>Validating secure prescription linkâ€¦</p>
      </main>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <main className="public-prescription-page" style={{ padding: '60px 20px', maxWidth: '540px', margin: '0 auto', textAlign: 'center' }}>
        <RxFlowLogo size="medium" />
        <div style={{ marginTop: '32px', padding: '32px 24px', background: 'var(--card-bg, #fff)', borderRadius: '12px', border: '1px solid var(--border-color, #e5e7eb)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <AlertCircle size={48} color="#dc2626" style={{ margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--foreground, #111827)', marginBottom: '8px' }}>Prescription Link Unavailable</h1>
          <p style={{ color: 'var(--muted-foreground, #4b5563)', fontSize: '15px', lineHeight: '1.5' }}>
            This prescription link is unavailable. Contact your clinic for a new link.
          </p>
        </div>
      </main>
    );
  }

  const data = summaryQuery.data;

  return (
    <main className="public-prescription-page" style={{ padding: '32px 16px', maxWidth: '680px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <RxFlowLogo size="small" />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: '20px', fontWeight: 500 }}>
          <ShieldCheck size={16} /> Secure Verification
        </div>
      </header>

      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)', padding: '32px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <span style={{ display: 'inline-flex', padding: '12px', background: '#e0e7ff', borderRadius: '50%', color: '#4f46e5', marginBottom: '12px' }}>
            <FileText size={28} />
          </span>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>Your prescription is ready</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Issued by {data.clinicName}</p>
        </div>

        <div style={{ background: '#f9fafb', borderRadius: '12px', padding: '20px', marginBottom: '28px', border: '1px solid #f3f4f6' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px' }}>
            <div>
              <small style={{ color: '#6b7280', fontSize: '12px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Clinic</small>
              <strong style={{ color: '#111827', display: 'block', marginTop: '2px' }}>{data.clinicName}</strong>
            </div>
            <div>
              <small style={{ color: '#6b7280', fontSize: '12px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Doctor</small>
              <strong style={{ color: '#111827', display: 'block', marginTop: '2px' }}>{data.doctorName}</strong>
            </div>
            <div>
              <small style={{ color: '#6b7280', fontSize: '12px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Patient</small>
              <strong style={{ color: '#111827', display: 'block', marginTop: '2px' }}>{data.maskedPatientName}</strong>
            </div>
            <div>
              <small style={{ color: '#6b7280', fontSize: '12px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issued Date</small>
              <strong style={{ color: '#111827', display: 'block', marginTop: '2px' }}>
                {new Date(data.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </strong>
            </div>
          </div>

          {data.clinicPhone && (
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4b5563' }}>
              <Phone size={15} color="#6b7280" />
              <span>Clinic Contact: <strong>{data.clinicPhone}</strong></span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleViewPdf}
            disabled={loadingPdf}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%',
              padding: '14px 20px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loadingPdf ? 'wait' : 'pointer',
              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Eye size={18} /> {loadingPdf ? 'Fetching PDFâ€¦' : 'View PDF'}
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button
              onClick={handleDownloadPdf}
              disabled={loadingPdf}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 16px',
                background: '#ffffff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: loadingPdf ? 'wait' : 'pointer',
              }}
            >
              <Download size={16} /> Download PDF
            </button>

            <button
              onClick={handlePrint}
              disabled={loadingPdf}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 16px',
                background: '#ffffff',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: loadingPdf ? 'wait' : 'pointer',
              }}
            >
              <Printer size={16} /> Print
            </button>
          </div>
        </div>

        {viewPdf && pdfBlobUrl && (
          <div style={{ marginTop: '28px', borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>Prescription Document</h3>
              <button
                onClick={() => setViewPdf(false)}
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Hide Viewer
              </button>
            </div>
            <iframe
              src={pdfBlobUrl}
              title="Prescription PDF"
              style={{ width: '100%', height: '540px', border: '1px solid #d1d5db', borderRadius: '8px' }}
            />
          </div>
        )}
      </div>

      <footer style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: '#9ca3af' }}>
        <span>This secure link expires automatically on {new Date(data.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.</span>
      </footer>
    </main>
  );
}

