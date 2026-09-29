import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCheck, Clock3, MessageCircle, ShieldCheck } from 'lucide-react';
import { client } from '../../api';
import type { CommunicationAlert, CommunicationMessage, Patient } from '../../types';
import { Page } from '../../ui/Page';
import { StateView } from '../../ui/States';
import { StatusBadge } from '../../ui/DataDisplay';
import './communications.css';

const labels: Record<string, string> = { queued: 'Queued', retry_scheduled: 'Retry scheduled', accepted: 'Accepted by Meta', sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed', replied: 'Patient replied', dead_letter: 'Needs follow-up' };
const icons: Record<string, typeof Clock3> = { delivered: CheckCheck, read: CheckCheck, sent: Check, failed: AlertTriangle, dead_letter: AlertTriangle, replied: MessageCircle };

export function CommunicationsPage() {
  const [selectedId, setSelectedId] = useState('');
  const patients = useQuery({ queryKey: ['patients', 'communications'], queryFn: async () => (await client.get('/patients', { params: { page: 1, limit: 50 } })).data.data as Patient[] });
  const effectiveId = selectedId || patients.data?.[0]?._id || '';
  const timeline = useQuery({ queryKey: ['communications', effectiveId], enabled: Boolean(effectiveId), queryFn: async () => (await client.get(`/communications/patients/${effectiveId}/timeline`, { params: { page: 1, limit: 50 } })).data as { data: { messages: CommunicationMessage[]; adapter: { label: string; adapter: 'cloud' } } } });
  const alerts = useQuery({ queryKey: ['communication-alerts'], queryFn: async () => (await client.get('/communications/alerts', { params: { page: 1, limit: 20, unreadOnly: 'true' } })).data.data.alerts as CommunicationAlert[] });
  const selected = useMemo(() => patients.data?.find((patient) => patient._id === effectiveId), [patients.data, effectiveId]);
  return <Page title="Patient communications" subtitle="Consent-led WhatsApp notifications, delivery receipts, and patient replies in one clinic-scoped timeline.">
    <div className="communication-layout">
      <section className="panel communication-sidebar" aria-labelledby="conversation-list-title"><div className="panel-heading"><div><p className="eyebrow">Conversations</p><h2 id="conversation-list-title">Patients</h2></div></div>{patients.isLoading ? <p className="muted">Loading patients…</p> : patients.data?.length ? <div className="conversation-list">{patients.data.map((patient) => <button key={patient._id} className={patient._id === effectiveId ? 'selected' : ''} aria-pressed={patient._id === effectiveId} onClick={() => setSelectedId(patient._id)}><span className="avatar">{patient.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{patient.name}</strong><small>{patient.maskedPhone ?? 'WhatsApp timeline'}</small></span></button>)}</div> : <StateView kind="empty" title="No patients yet" message="Patient conversations will appear after registration."/>}</section>
      <section className="panel communication-main" aria-labelledby="timeline-title"><div className="panel-heading"><div><p className="eyebrow">WhatsApp timeline</p><h2 id="timeline-title">{selected?.name ?? 'Select a patient'}</h2></div><ShieldCheck aria-label="Consent protected"/></div>{timeline.data?.data.adapter && <div className={`adapter-banner ${timeline.data.data.adapter.adapter}`}><MessageCircle size={18}/><span>{timeline.data.data.adapter.label}</span></div>}{!effectiveId ? <StateView kind="empty" title="Choose a patient" message="Select a patient to review communication events."/> : timeline.isLoading ? <p className="muted">Loading timeline…</p> : timeline.isError ? <StateView kind="error" title="Unable to load timeline" message="The communication history could not be loaded."/> : timeline.data?.data.messages.length ? <ol className="message-timeline">{timeline.data.data.messages.map((message) => { const Icon = icons[message.status] ?? Clock3; return <li key={message._id}><span className={`timeline-icon ${message.status}`}><Icon size={17}/></span><div><div className="timeline-heading"><strong>{labels[message.status] ?? message.status}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div><p>{message.direction === 'inbound' ? message.replyText : purposeLabel(message.purpose)}</p>{message.timeline.length > 1 && <div className="status-trail">{message.timeline.map((event, index) => <StatusBadge key={`${event.status}-${index}`} status={event.status}/>)}</div>}</div></li>; })}</ol> : <StateView kind="empty" title="No messages yet" message="Approved notifications and patient replies will appear here without exposing diagnosis or prescription contents."/>}</section>
      <aside className="panel reception-alerts" aria-labelledby="reception-alerts-title"><p className="eyebrow">Reception desk</p><h2 id="reception-alerts-title">Needs attention</h2>{alerts.data?.length ? <ul>{alerts.data.map((alert) => <li key={alert._id}><AlertTriangle size={16}/><span>{alert.summary}<small>{new Date(alert.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></span></li>)}</ul> : <p className="muted">No unread replies or failures.</p>}</aside>
    </div>
  </Page>;
}

function purposeLabel(purpose: string) { return ({ appointment_confirmation: 'Appointment confirmation', appointment_reminder_24h: '24-hour appointment reminder', appointment_reminder_2h: '2-hour appointment reminder', prescription_ready: 'Prescription-ready notification' } as Record<string, string>)[purpose] ?? 'Clinic notification'; }
