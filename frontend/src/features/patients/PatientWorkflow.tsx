import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, MessageCircle, Plus, QrCode, RotateCw } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { client, errorMessage } from '../../api';
import { useAuth } from '../../auth';
import type { Patient, Prescription, QueueEntry, User } from '../../types';
import { Pagination, ResponsiveDataList, SearchField, StatusBadge } from '../../ui/DataDisplay';
import { notify as toast } from '../../ui/Feedback';
import { Modal } from '../../ui/Overlay';
import { Page } from '../../ui/Page';
import { LoadingSkeleton, StateView } from '../../ui/States';
import './consent.css';

type PaginationData = { total: number; page: number; limit: number; totalPages: number };
type QrCodeData = { imageDataUrl: string; contentType: 'image/png'; format: 'png'; containsPatientData: false; issuedAt?: string };
type HistoryData = { patient: Patient; visitHistory: QueueEntry[]; visitPagination: PaginationData; daysSinceLastVisit: number | null };

const today = new Date().toISOString().slice(0, 10);
const isOffline = (error: unknown) => !navigator.onLine || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_NETWORK');
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'patient';

function QueryState({ error, retry, message }: { error: unknown; retry: () => void; message: string }) {
  const offline = isOffline(error);
  return <StateView kind={offline ? 'offline' : 'error'} title={offline ? 'You’re offline' : 'Unable to load'} message={offline ? 'Reconnect to the clinic service, then retry. No changes were recorded.' : message} action={<button className="button small" onClick={retry}>Try again</button>}/>;
}

function PatientQr({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const qr = useQuery({ queryKey: ['qr', patientId], queryFn: async () => (await client.get(`/patients/${patientId}/qr`)).data.data.qrCode as QrCodeData });
  const rotate = useMutation({
    mutationFn: async () => (await client.post(`/patients/${patientId}/qr/rotate`)).data.data.qrCode as QrCodeData,
    onSuccess: (data) => { queryClient.setQueryData(['qr', patientId], data); toast.success('Patient QR rotated; the previous code is revoked'); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (qr.isLoading) return <LoadingSkeleton label="Loading patient QR" rows={1}/>;
  if (qr.isError) return <QueryState error={qr.error} retry={() => void qr.refetch()} message="We couldn’t load this patient QR."/>;
  if (!qr.data) return null;
  return <section className="patient-qr" aria-label="Patient QR">
    <img src={qr.data.imageDataUrl} alt={`QR code for ${patientName}`}/>
    <div><strong>Opaque patient identity</strong><small>The code contains no patient details.</small></div>
    <div className="qr-actions">
      <a className="button small" href={qr.data.imageDataUrl} download={`${slug(patientName)}-qr.png`}><Download size={16}/> Download QR</a>
      {user?.role === 'admin' && <button className="button ghost small" disabled={rotate.isPending} onClick={() => rotate.mutate()}><RotateCw size={16}/> {rotate.isPending ? 'Rotating…' : 'Rotate QR'}</button>}
    </div>
  </section>;
}

export function PatientRegistryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pendingPatient, setPendingPatient] = useState<Patient | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [registered, setRegistered] = useState<{ patient: Patient; queueEntry: QueueEntry; qrCode: QrCodeData } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', age: '', gender: 'female', chiefComplaint: '', assignedDoctorId: user?.role === 'doctor' ? user._id : '' });
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: async () => (await client.get('/auth/doctors')).data.data.doctors as User[] });
  const list = useQuery({
    queryKey: ['patients', search, page],
    queryFn: async () => (await client.get('/patients', { params: { page, limit: 10, ...(search.trim().length >= 2 ? { search: search.trim(), match: 'prefix' } : {}) } })).data as { data: Patient[]; pagination: PaginationData },
  });
  const add = useMutation({
    mutationFn: async () => {
      let rawPhone = form.phone.replace(/[\s()-]/g, '');
      if (/^[1-9]\d{9}$/.test(rawPhone)) {
        rawPhone = `+91${rawPhone}`;
      } else if (/^91[1-9]\d{9}$/.test(rawPhone)) {
        rawPhone = `+${rawPhone}`;
      } else if (!rawPhone.startsWith('+')) {
        rawPhone = `+${rawPhone}`;
      }
      return (await client.post('/patients', { ...form, phone: rawPhone, age: Number(form.age), assignedDoctorId: form.assignedDoctorId || user?._id })).data.data as { patient: Patient; queueEntry: QueueEntry; qrCode: QrCodeData };
    },
    onSuccess: (data) => {
      setShowPreview(false);
      setRegistered(data);
      toast.success(`Patient added successfully. Queue number: ${data.queueEntry?.queueNumber ?? 1}`);
      setForm({ name: '', phone: '', age: '', gender: 'female', chiefComplaint: '', assignedDoctorId: user?.role === 'doctor' ? user._id : '' });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      void queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const checkIn = useMutation({
    mutationFn: (patient: Patient) => client.post(`/patients/${patient._id}/check-ins`, { doctorId: patient.assignedDoctorId }),
    onSuccess: () => { setPendingPatient(null); toast.success('Returning patient checked into the queue'); void queryClient.invalidateQueries({ queryKey: ['queue'] }); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const pagination = list.data?.pagination;
  const selectedDoctor = doctors.data?.find((d) => d._id === (form.assignedDoctorId || user?._id)) ?? (user ? { _id: user._id, name: user.name } as User : undefined);

  return <Page title="Patient registry" subtitle="Register a new patient or confirm a returning patient’s masked identity.">
    <div className="two-column">
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Find a patient</p><h2>Returning visits</h2></div></div>
        <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} label="Search patient name" placeholder="Search full name"/>
        {list.isLoading ? <LoadingSkeleton label="Searching patients"/> : list.isError ? <QueryState error={list.error} retry={() => void list.refetch()} message="We couldn’t search the patient registry."/> : list.data?.data.length ? <>
          <div className="patient-list">{list.data.data.map((patient) => <div className="patient-result" key={patient._id}>
            <Link to={`/app/patients/${patient._id}`}><span className="avatar">{patient.name.split(' ').map((item) => item[0]).slice(0, 2).join('')}</span><span><strong>{patient.name}</strong><small>{patient.maskedPhone} · {patient.age} yrs · {patient.gender}</small></span></Link>
            <button className="text-button" aria-label={`Check in ${patient.name}`} disabled={checkIn.isPending} onClick={() => setPendingPatient(patient)}>Check in</button>
          </div>)}</div>
          {pagination && <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage}/>} 
        </> : <StateView kind="empty" title={search.trim().length >= 2 ? 'No matching patients' : 'Search by full name'} message={search.trim().length >= 2 ? 'Check the spelling or register a new patient.' : 'Matches appear with masked phone, age, and gender so duplicate names can be distinguished safely.'}/>} 
      </section>
      <section className="panel"><p className="eyebrow">New visit</p><h2>Register patient</h2>
      <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '12px' }}>Enter the details provided on the patient’s reception form.</p>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); setShowPreview(true); }}>
        <label>Full name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
        <label>WhatsApp number<input required inputMode="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label>
        <label>Age<input required type="number" min="1" max="120" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })}/></label>
        <label>Gender<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
        <label className="full">Chief complaint<textarea required value={form.chiefComplaint} onChange={(event) => setForm({ ...form, chiefComplaint: event.target.value })}/></label>
        <button className="button full" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Preview patient registration'}</button>
      </form></section>
    </div>
    <Modal open={Boolean(pendingPatient)} title="Confirm patient identity" danger onClose={() => setPendingPatient(null)}>
      <p>Confirm <strong>{pendingPatient?.name}</strong>, {pendingPatient?.age} years, {pendingPatient?.gender}, phone <strong>{pendingPatient?.maskedPhone}</strong>. Only continue after the patient confirms these masked details.</p>
      <div className="dialog-actions"><button className="button ghost" onClick={() => setPendingPatient(null)}>Cancel</button><button className="button" disabled={checkIn.isPending} onClick={() => pendingPatient && checkIn.mutate(pendingPatient)}>{checkIn.isPending ? 'Checking in…' : 'Confirm check-in'}</button></div>
    </Modal>
    <Modal open={showPreview} title="Confirm patient registration" onClose={() => setShowPreview(false)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p>Please review the details before registering the patient and generating their queue entry:</p>
        <dl className="details-list" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', margin: 0 }}>
          <dt style={{ fontWeight: 600 }}>Full Name:</dt><dd>{form.name}</dd>
          <dt style={{ fontWeight: 600 }}>Phone:</dt><dd>{form.phone}</dd>
          <dt style={{ fontWeight: 600 }}>Age & Gender:</dt><dd>{form.age} years ({form.gender})</dd>
          <dt style={{ fontWeight: 600 }}>Assigned Doctor:</dt><dd>{selectedDoctor?.name || (user?.role === 'doctor' ? user.name : 'Unassigned')}</dd>
          <dt style={{ fontWeight: 600 }}>Chief Complaint:</dt><dd>{form.chiefComplaint}</dd>
        </dl>
      </div>
      <div className="dialog-actions" style={{ marginTop: '20px' }}>
        <button type="button" className="button ghost" onClick={() => setShowPreview(false)}>Edit details</button>
        <button type="button" className="button" disabled={add.isPending} onClick={() => add.mutate()}>{add.isPending ? 'Registering…' : 'Confirm & Add to Queue'}</button>
      </div>
    </Modal>
    <Modal open={Boolean(registered)} title="Patient registered & queued" onClose={() => setRegistered(null)}>
      {registered && <><p>Queue entry <strong>#{registered.queueEntry?.queueNumber}</strong> created for <strong>{registered.patient.name}</strong>. Save this opaque QR for identity resolution.</p><section className="patient-qr"><img src={registered.qrCode.imageDataUrl} alt={`QR code for ${registered.patient.name}`}/><a className="button small" href={registered.qrCode.imageDataUrl} download={`${slug(registered.patient.name)}-qr.png`}><Download size={16}/> Download QR</a></section></>}
    </Modal>
  </Page>;
}

function QueueList({ entries }: { entries: QueueEntry[] }) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: ({ entry, status }: { entry: QueueEntry; status: QueueEntry['status'] }) => client.patch(`/patients/queue/${entry._id}/status`, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['queue'] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const render = (entry: QueueEntry) => {
    const patientName = entry.patient?.name ?? 'Patient';
    const canStart = entry.status === 'waiting';
    const canComplete = entry.status === 'in_consultation';
    const canCancel = entry.status === 'waiting' || entry.status === 'in_consultation';
    return <div className="queue-item"><b>{String(entry.queueNumber).padStart(2, '0')}</b><span><strong>{patientName}</strong><small>{entry.patient?.maskedPhone || 'Identity confirmed'}</small></span><StatusBadge status={entry.status}/><div className="queue-actions">
      {canStart && <button className="text-button" aria-label={`Start ${patientName}`} onClick={() => update.mutate({ entry, status: 'in_consultation' })}>Start</button>}
      {canComplete && <button className="text-button" aria-label={`Complete ${patientName}`} onClick={() => update.mutate({ entry, status: 'completed' })}>Complete</button>}
      {canCancel && <button className="text-button danger-text" aria-label={`Cancel ${patientName}`} onClick={() => update.mutate({ entry, status: 'cancelled' })}>Cancel</button>}
    </div></div>;
  };
  return <ResponsiveDataList label="Clinic queue" rows={entries} rowKey={(entry) => entry._id} renderRow={render} renderCard={render}/>;
}

export function DailyQueuePage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const doctors = useQuery({ queryKey: ['doctors'], enabled: user?.role !== 'doctor', queryFn: async () => (await client.get('/auth/doctors')).data.data.doctors as User[] });
  const queue = useQuery({ queryKey: ['queue', today, page, status, doctorId], queryFn: async () => (await client.get('/patients/queue', { params: { date: today, page, limit: 10, ...(status ? { status } : {}), ...(doctorId ? { doctorId } : {}) } })).data as { data: QueueEntry[]; pagination: PaginationData } });
  const data = queue.data;
  return <Page title="Today’s queue" subtitle="Doctor-specific numbering and server-enforced status transitions.">
    <section className="panel"><div className="queue-toolbar">{user?.role !== 'doctor' && <label>Doctor queue<select aria-label="Doctor queue" value={doctorId} onChange={(event) => { setDoctorId(event.target.value); setPage(1); }}><option value="">All doctors</option>{doctors.data?.map((doctor) => <option key={doctor._id} value={doctor._id}>{doctor.name}</option>)}</select></label>}<label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="waiting">Waiting</option><option value="in_consultation">In consultation</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label></div>
      {queue.isLoading ? <LoadingSkeleton label="Loading daily queue"/> : queue.isError || !data ? <QueryState error={queue.error} retry={() => void queue.refetch()} message="We couldn’t load today’s queue."/> : data.data.length ? <><QueueList entries={data.data}/><Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage}/></> : <StateView kind="empty" title="No patients in today’s queue" message="Patient check-ins will appear here."/>}
    </section>
  </Page>;
}

export function PatientProfilePage() {
  const { id } = useParams();
  const [visitPage, setVisitPage] = useState(1);
  const history = useQuery({ queryKey: ['patient', id, visitPage], enabled: Boolean(id), queryFn: async () => (await client.get(`/patients/${id}`, { params: { page: visitPage, limit: 10 } })).data.data as HistoryData });
  const prescriptions = useQuery({ queryKey: ['prescriptions', id], enabled: Boolean(id), queryFn: async () => (await client.get('/prescriptions', { params: { patientId: id, page: 1, limit: 20 } })).data.data as Prescription[] });
  if (!id) return <Navigate to="/app/patients" replace/>;
  if (history.isLoading) return <main className="page"><LoadingSkeleton label="Loading patient profile"/></main>;
  if (history.isError) return <Page title="Patient profile" subtitle="Clinic-scoped history."><section className="panel"><QueryState error={history.error} retry={() => void history.refetch()} message="We couldn’t load this patient profile."/></section></Page>;
  const data = history.data;
  if (!data) return null;
  const patient = data.patient;
  return <Page title={patient.name} subtitle="Clinic-scoped identity and visit history." action={<Link className="button small" to={`/app/prescription/new?patientId=${id}`}><Plus size={16}/> Prescription</Link>}>
    <div className="two-column"><section className="panel profile-card"><span className="avatar large">{patient.name.slice(0, 2)}</span><h2>{patient.name}</h2><p>{patient.age} years · {patient.gender} · {patient.bloodGroup || 'Blood group not recorded'}</p><dl><dt>Total visits</dt><dd>{patient.totalVisits}</dd><dt>Chief complaint</dt><dd>{patient.chiefComplaint || 'Not recorded'}</dd></dl><ConsentPanel patient={patient} onSaved={() => void history.refetch()}/><PatientQr patientId={id} patientName={patient.name}/></section>
      <section className="panel"><p className="eyebrow">Clinical record</p><h2>Visit history</h2>{data.visitHistory.length ? <div className="history-list">{data.visitHistory.map((visit) => <article key={visit._id}><strong>Queue {visit.queueNumber}</strong><small>{visit.queueDate ? new Date(`${visit.queueDate}T00:00:00`).toLocaleDateString('en-IN') : 'Visit'} · <StatusBadge status={visit.status}/></small></article>)}</div> : <StateView kind="empty" title="No visits yet" message="Completed and cancelled visits will remain visible here."/>}<Pagination page={data.visitPagination.page} totalPages={data.visitPagination.totalPages} onPageChange={setVisitPage}/>
        <h2 className="section-title">Prescriptions</h2>{prescriptions.isLoading ? <LoadingSkeleton label="Loading prescriptions" rows={2}/> : prescriptions.isError ? <QueryState error={prescriptions.error} retry={() => void prescriptions.refetch()} message="We couldn’t load prescription history."/> : prescriptions.data?.length ? <div className="history-list">{prescriptions.data.map((item) => <article key={item._id}><strong>{item.diagnosis}</strong><small>{new Date(item.visitDate).toLocaleDateString('en-IN')} · {item.deliveryStatus}</small></article>)}</div> : <StateView kind="empty" title="No prescriptions yet" message="A doctor can create one after starting consultation."/>}
      </section></div>
  </Page>;
}

function ConsentPanel({ patient, onSaved }: { patient: Patient; onSaved: () => void }) {
  const [appointments, setAppointments] = useState(patient.communicationConsent?.categories.includes('appointments') ?? false); const [prescriptionReady, setPrescriptionReady] = useState(patient.communicationConsent?.categories.includes('prescription_ready') ?? false);
  const save = useMutation({ mutationFn: (status: 'opted_in' | 'opted_out') => client.patch(`/patients/${patient._id}/communication-consent`, { status, source: 'in_person', categories: [appointments && 'appointments', prescriptionReady && 'prescription_ready'].filter(Boolean) }), onSuccess: () => { toast.success('WhatsApp consent updated'); onSaved(); }, onError: (error) => toast.error(errorMessage(error)) });
  return <section className="consent-panel" aria-labelledby="consent-title"><p className="eyebrow"><MessageCircle size={14}/> Communication consent</p><h3 id="consent-title">{patient.communicationConsent?.status === 'opted_in' ? 'Patient opted in' : patient.communicationConsent?.status === 'opted_out' ? 'Patient opted out' : 'Consent not recorded'}</h3><label><input type="checkbox" checked={appointments} onChange={(event) => setAppointments(event.target.checked)}/> Appointment updates</label><label><input type="checkbox" checked={prescriptionReady} onChange={(event) => setPrescriptionReady(event.target.checked)}/> Prescription-ready notices</label><div className="qr-actions"><button className="button small" disabled={save.isPending || (!appointments && !prescriptionReady)} onClick={() => save.mutate('opted_in')}>Record opt-in</button><button className="button ghost small" disabled={save.isPending} onClick={() => save.mutate('opted_out')}>Record opt-out</button></div><small>Confirm the patient supplied this number and agreed to these categories.</small></section>;
}

export function QrResolutionPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const resolve = useMutation({ mutationFn: () => client.get(`/patients/qr/${value.trim().split('/').filter(Boolean).at(-1) || ''}`), onSuccess: ({ data }) => navigate(`/app/patients/${data.data.patient._id}`), onError: (error) => toast.error(errorMessage(error)) });
  return <Page title="Resolve patient QR" subtitle="Resolve an opaque code within your authenticated clinic."><section className="panel qr-resolve"><QrCode size={30}/><h2>Find a patient securely</h2><p>Paste the scanned QR URL or its final opaque token.</p><form onSubmit={(event) => { event.preventDefault(); resolve.mutate(); }}><label>QR link or token<input required value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://…/checkin/opaque-token"/></label><button className="button" disabled={resolve.isPending}>{resolve.isPending ? 'Resolving…' : 'Resolve patient'}</button></form></section></Page>;
}
