import { Component, type ErrorInfo, type ReactNode, useCallback, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { Activity, ArrowRight, Bell, Bot, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Clock3, LayoutDashboard, LockKeyhole, LogOut, Menu, MessageCircle, Moon, PackageSearch, Plus, QrCode, Search, Settings, ShieldCheck, Sun, Users } from 'lucide-react';
import { client, errorMessage } from './api';
import { AuthProvider, useAuth } from './auth';
import { useTheme } from './theme';
import type { Appointment, QueueEntry } from './types';
import { Page } from './ui/Page';
import { LoadingSkeleton, StateView } from './ui/States';
import { ResponsiveDataList, StatusBadge } from './ui/DataDisplay';
import { useOverlayFocus } from './ui/Overlay';
import { notify as toast } from './ui/Feedback';
import { ChangePasswordPage, ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from './features/auth/AuthPages';
import { AdminSettingsPage } from './features/admin/AdminSettings';
import { DailyQueuePage, PatientProfilePage, PatientRegistryPage, QrResolutionPage } from './features/patients/PatientWorkflow';
import { CommunicationsPage } from './features/communications/CommunicationsPage';
import { OperationalAnalyticsPage } from './features/analytics/OperationalAnalytics';
import { DropoutRadarPage } from './features/analytics/DropoutRadar';
import { ClinicFeedbackPage, PatientFeedbackPage } from './features/feedback/FeedbackPages';
import { PrescriptionEditor } from './features/prescriptions/PrescriptionEditor';
import { PrescriptionWorkspace } from './features/prescriptions/PrescriptionWorkspace';
import { PublicPrescriptionPage } from './features/prescriptions/PublicPrescriptionPage';
import { JarvisDock, JarvisLauncher, JarvisProvider, JarvisWorkspace } from './features/jarvis/Jarvis';
import { InventoryPage } from './features/inventory/InventoryPage';
import { RxFlowLogo } from './ui/RxFlowLogo';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> { state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; } componentDidCatch(_error: Error, _info: ErrorInfo) {} render() { return this.state.failed ? <main className="error-state"><h1>We hit a snag.</h1><p>Refresh the page to restore your clinic workspace.</p><button onClick={() => location.reload()}>Refresh workspace</button></main> : this.props.children; } }

const futurePages = ['Billing'];
const today = new Date().toISOString().slice(0, 10);
function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) { const reduced = useReducedMotion(); return <motion.div initial={reduced ? false : { opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .16 }} transition={{ duration: .55, delay }}>{children}</motion.div>; }
function Metric({ value, label }: { value: string; label: string }) { return <div className="metric"><strong>{value}</strong><span>{label}</span></div>; }
function MockCard({ title, children, tone = '' }: { title: string; children: ReactNode; tone?: string }) { return <div className={`mock-card ${tone}`}><div className="mock-top"><span className="live-dot" /> <strong>{title}</strong><span className="mock-more">â€¢â€¢â€¢</span></div>{children}</div>; }

function Marketing() { return <main className="marketing"><header className="site-nav"><Link className="brand" to="/" style={{ display: 'flex', alignItems: 'center' }}><RxFlowLogo size="small"/></Link><nav><a href="#workflow">Workflow</a><a href="#automation">Automation</a><a href="#future">Future</a></nav><div className="nav-actions"><Link className="button ghost small" to="/staff-login">Doctor login</Link><Link className="button small start-clinic" to="/signup">Start clinic <ArrowRight size={16}/></Link></div></header>
  <section className="hero"><Reveal><p className="eyebrow"><span className="live-dot"/> Built for India's independent clinics</p><h1>Clinical work, <em>in flow.</em></h1><p className="lede">A calm, WhatsApp-first clinic workspace for the people who keep care moving.</p><div className="hero-actions"><Link className="button" to="/signup">Start your clinic <ArrowRight size={18}/></Link><a className="button ghost" href="#dashboard">See the dashboard <ChevronRight size={18}/></a></div></Reveal><Reveal delay={.16}><div id="dashboard" className="hero-dashboard"><div className="dash-side"><small>Tuesday, 10:42 AM</small><h3>Good morning,<br/>Dr. Mehta</h3><button className="quick"><Plus size={16}/> Add patient</button><p><span className="live-dot"/> 12 patients in queue</p></div><div className="dash-main"><div className="dash-heading"><span>Today's flow</span><b>12 <small>patients</small></b></div><div className="queue-row active"><b>01</b><span>Riya Sharma<small>Follow-up Â· 10:30</small></span><i>In consultation</i></div><div className="queue-row"><b>02</b><span>Vikram Patel<small>New visit Â· 10:45</small></span><i>Waiting</i></div><div className="queue-row"><b>03</b><span>Meera Kapoor<small>BP review Â· 11:00</small></span><i>Waiting</i></div></div></div></Reveal></section>
  <section className="proof"><Metric value="< 3 sec" label="prescription delivery target"/><Metric value="24 / 7" label="patient communication"/><Metric value="1 place" label="for your clinic flow"/><Metric value="0" label="clinical decisions made by AI"/></section>
  <Showcases />
  <section id="future" className="future"><Reveal><p className="eyebrow">Built with care for what comes next</p><h2>The future of Indian<br/><em>health is consent-led.</em></h2><p>RxFlow is designed for privacy-first workflows today, with ABHA and ABDM interoperability as a clearly marked future capability.</p><div className="future-grid"><div><ShieldCheck size={24}/><b>Explicit consent</b><span>Patients stay in control of record sharing.</span></div><div><QrCode size={24}/><b>Scan & share</b><span>Faster check-in without exposing patient data.</span></div><div><LockKeyhole size={24}/><b>Private by default</b><span>Clinic data stays clinic-scoped and protected.</span></div></div></Reveal></section>
  <section className="closing"><Reveal><p className="eyebrow">Ready when your clinic is</p><h2>Less chasing.<br/><em>More care.</em></h2><Link className="button" to="/signup">Start your clinic <ArrowRight size={18}/></Link></Reveal></section><footer><span>Â© {new Date().getFullYear()} RxFlow AI</span><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></footer></main>; }

function Showcases() { const cards = [
  ['Patient flow', 'From arrival to follow-up â€” without losing the thread.', <div className="flow"><span>Register</span><ArrowRight/><span className="filled">Queue #12</span><ArrowRight/><span>Consult</span><ArrowRight/><span>Reviewed Rx</span></div>],
  ['Indian clinic workflows', 'Fast patient intake. Focused clinical work.', <div className="split-list"><span><Search/> Returning patient search</span><span><ClipboardList/> Numbered doctor queue</span><span><QrCode/> Opaque QR check-in</span></div>],
  ['WhatsApp Cloud API', 'Approved templates and verified delivery events in one timeline.', <div className="whatsapp"><p><b>WhatsApp Cloud API</b><small>Approved template queued by RxFlow</small></p><p className="sent">WEBHOOK<small>Delivery status appears after Meta confirms it</small></p><i><CheckCircle2/> Clinic follow-up is recorded safely</i></div>],
  ['Patient portfolio & settings', 'History, permissions, branding and staff â€” thoughtfully organised.', <div className="portfolio"><div className="avatar">RS</div><span>Riya Sharma<small>4 visits Â· A+</small></span><div className="swatches"><i/><i/><i/></div></div>],
]; return <section id="workflow" className="showcases"><Reveal><p className="eyebrow">A better clinic rhythm</p><h2>Every handoff, <em>visible.</em></h2></Reveal><div className="showcase-grid">{cards.map(([title, copy, visual], index) => <Reveal delay={index * .06} key={String(title)}><article><span className="section-number">0{index + 1}</span><h3>{title}</h3><p>{copy}</p><MockCard title={String(title)} tone={index === 2 ? 'green' : ''}>{visual as ReactNode}</MockCard></article></Reveal>)}</div><section id="automation" className="automation"><Reveal><div><p className="eyebrow">The right message, at the right moment</p><h2>Automation that<br/><em>still feels human.</em></h2><p>Confirmations, reminders, delivery receipts and replies move into one visible workflowâ€”without removing staff control.</p></div><div className="automation-timeline"><span><b>24h before</b> Appointment reminder queued</span><span><b>2h before</b> Final reminder sent</span><span><b>Now</b> Patient confirms <CheckCircle2/></span></div></Reveal></section></section>; }

// --- Route guards ---
function DoctorOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'doctor') return <div className="future-page"><span className="feature-icon"><ShieldCheck/></span><p className="eyebrow">Access restricted</p><h1>Doctor access required</h1><p>This clinical workspace is available to authorized doctors only. Administrators can manage settings and doctor accounts from the admin dashboard.</p><Link className="button" to="/app">Back to dashboard</Link></div>;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== 'admin') return <div className="future-page"><span className="feature-icon"><ShieldCheck/></span><p className="eyebrow">Access restricted</p><h1>Administrator access required</h1><p>This page is available to clinic administrators only.</p><Link className="button" to="/app">Back to dashboard</Link></div>;
  return <>{children}</>;
}

function ModeMenu() { const { mode, setMode } = useTheme(); return <div className="mode-menu" aria-label="Appearance"><button className={mode === 'light' ? 'selected' : ''} onClick={() => setMode('light')}><Sun size={15}/> Light</button><button className={mode === 'dark' ? 'selected' : ''} onClick={() => setMode('dark')}><Moon size={15}/> Dark</button><button className={mode === 'system' ? 'selected' : ''} onClick={() => setMode('system')}>System</button></div>; }
function RequireAuth() { const { user, ready, offline, refresh, lastRole } = useAuth(); const location = useLocation(); if (!ready) return <main className="connection-state"><LoadingSkeleton label="Opening your workspace" rows={3}/></main>; if (offline) return <main><StateView compact={false} kind="offline" title="You're offline" message="RxFlow could not reach the clinic service. Your protected route has been kept for you." action={<button className="button" onClick={() => void refresh().then(() => window.location.reload()).catch(() => undefined)}>Retry connection</button>}/></main>; return user ? <Outlet /> : <Navigate to={lastRole && lastRole !== 'admin' ? '/staff-login' : '/login'} replace state={{ from: location }} />; }

function AppShell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const closeDrawer = useCallback(() => setOpen(false), []);
  const drawerRef = useOverlayFocus(open, closeDrawer);

  // Role-specific navigation
  const doctorLinks = [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/app/patients', label: 'Patients', icon: Users },
    { to: '/app/queue', label: 'Today\u2019s queue', icon: ClipboardList },
    { to: '/app/appointments', label: 'Appointments', icon: CalendarDays },
    { to: '/app/communications', label: 'Communications', icon: MessageCircle },
    { to: '/app/inventory', label: 'Medicine inventory', icon: PackageSearch },
    { to: '/app/qr', label: 'Resolve QR', icon: QrCode },
    { to: '/app/prescription/new', label: 'New prescription', icon: Activity },
    { to: '/app/jarvis', label: 'Jarvis Assistant', icon: Bot },
    { to: '/app/analytics', label: 'Analytics', icon: Activity },
    { to: '/app/dropout', label: 'Dropout radar', icon: Clock3 },
    { to: '/app/feedback', label: 'Feedback', icon: MessageCircle },
  ];

  const adminLinks = [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/app/analytics', label: 'Analytics', icon: Activity },
    { to: '/app/jarvis', label: 'Jarvis Diagnostics', icon: Bot },
    { to: '/app/settings', label: 'Doctor Management & Settings', icon: Settings },
  ];

  const links = user?.role === 'admin' ? adminLinks : doctorLinks;

  return <JarvisProvider><div className="app-shell">
    {open && <button className="drawer-scrim mobile-only" aria-label="Close navigation" onClick={closeDrawer}/>}
    <aside ref={drawerRef} className={open ? 'open' : ''} role={open ? 'dialog' : undefined} aria-modal={open ? 'true' : undefined} aria-label={open ? 'Clinic navigation' : undefined}>
      <Link className="brand" to="/app" onClick={closeDrawer} style={{ display: 'flex', alignItems: 'center' }}><RxFlowLogo size="small"/></Link>
      <nav>{links.map(({ to, label, icon: Icon }) => <NavLink end={to === '/app'} key={to} to={to} onClick={closeDrawer}><Icon size={18}/>{label}</NavLink>)}</nav>
      <div className="side-bottom"><ModeMenu/><button onClick={() => { const logoutRequest = logout(); navigate('/', { replace: true }); void logoutRequest; }}><LogOut size={16}/> Sign out</button></div>
    </aside>
    <main className="app-main">
      <header className="app-header"><button className="icon-button mobile-only" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(!open)}><Menu/></button><div className="search-placeholder"><Search size={17}/><span>Search patients</span><kbd>âŒ˜ K</kbd></div><div className="header-person"><Bell size={18}/><span>{user?.name}<small>{user?.role}</small></span></div></header>
      <Outlet/>
    </main>
    <JarvisLauncher/>
    <JarvisDock/>
  </div></JarvisProvider>;
}

function Dashboard() { const { user } = useAuth(); const queue = useQuery({ queryKey: ['queue', today], enabled: user?.role === 'doctor', queryFn: async () => (await client.get('/patients/queue', { params: { date: today } })).data.data as QueueEntry[] }); const patients = useQuery({ queryKey: ['patients', 'dashboard'], enabled: user?.role === 'doctor', queryFn: async () => (await client.get('/patients', { params: { page: 1, limit: 1 } })).data }); const waiting = queue.data?.filter((item) => item.status === 'waiting').length ?? 0;
  if (user?.role === 'admin') return <Page title={`Welcome, ${user?.name?.split(' ')[0] ?? 'Administrator'}.`} subtitle="Manage your clinic settings, doctors, and system diagnostics."><div className="stat-grid"><Stat icon={Settings} label="Settings" value="Manage" /><Stat icon={Users} label="Doctors" value="Manage" /><Stat icon={Bot} label="Jarvis" value="Diagnostics" /><Stat icon={Activity} label="Analytics" value="View" /></div></Page>;
  return <Page title={`Good to see you, ${user?.name?.split(' ')[0] ?? 'there'}.`} subtitle="Here is the clinic rhythm for today." action={<Link className="button small" to="/app/patients"><Plus size={16}/> Add patient</Link>}><div className="stat-grid"><Stat icon={Users} label="Patients in queue" value={queue.data?.length ?? 'â€”'} /><Stat icon={Clock3} label="Waiting now" value={waiting} /><Stat icon={Activity} label="Current status" value={queue.isLoading ? 'Loading' : queue.isError ? 'Unavailable' : waiting ? 'Active' : 'Clear'} /><Stat icon={CalendarDays} label="Patient records" value={patients.data?.pagination?.total ?? 'â€”'} /></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Live queue</p><h2>Today's patients</h2></div><Link to="/app/queue">Open queue <ArrowRight size={15}/></Link></div>{queue.isLoading ? <p className="muted">Loading queueâ€¦</p> : queue.isError ? <AsyncError error={queue.error} message="We couldn't load today's queue." retry={() => void queue.refetch()}/> : queue.data?.length ? <QueueTable entries={queue.data} /> : <Empty title="Your queue is clear" copy="Add a patient or check in a returning patient to begin today's flow." action={<Link className="button small" to="/app/patients">Manage patients</Link>}/>}</section></Page>; }
function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) { return <div className="stat"><Icon size={20}/><strong>{value}</strong><span>{label}</span></div>; }
function Empty({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) { return <StateView kind="empty" title={title} message={copy} action={action}/>; }
function AsyncError({ error, message, forbiddenMessage, retry }: { error: unknown; message: string; forbiddenMessage?: string; retry: () => void }) { const forbidden = (error as { response?: { status?: number } })?.response?.status === 403; return <StateView kind={forbidden ? 'forbidden' : 'error'} title={forbidden ? 'Access restricted' : 'Unable to load'} message={forbidden ? (forbiddenMessage || 'Your role does not have access to this information.') : message} action={!forbidden && <button className="button small" onClick={retry}>Try again</button>}/>; }
function QueueTable({ entries }: { entries: QueueEntry[] }) { const queryClient = useQueryClient(); const mutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: QueueEntry['status'] }) => client.patch(`/patients/queue/${id}/status`, { status }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queue'] }), onError: (error) => toast.error(errorMessage(error)) }); const render = (entry: QueueEntry) => { const patient = entry.patient; const next = entry.status === 'waiting' ? 'in_consultation' : entry.status === 'in_consultation' ? 'completed' : null; return <div className="queue-item"><b>{String(entry.queueNumber).padStart(2, '0')}</b><span><strong>{patient?.name ?? 'Patient'}</strong><small>{patient?.chiefComplaint || 'Consultation'}</small></span><StatusBadge status={entry.status}/>{next && <button className="text-button" onClick={() => mutation.mutate({ id: entry._id, status: next })}>{next === 'in_consultation' ? 'Start' : 'Complete'}</button>}</div>; }; return <ResponsiveDataList label="Clinic queue" rows={entries} rowKey={(entry) => entry._id} renderRow={render} renderCard={render}/>; }

function PublicQrCheckInPage() {
  const { token } = useParams();
  const [status, setStatus] = useState<{ queueNumber?: number; message?: string } | null>(null);
  const checkIn = useMutation({
    mutationFn: () => client.post(`/patients/public-checkin/${token}`),
    onSuccess: ({ data }) => {
      setStatus({ queueNumber: data.data.queueNumber, message: 'You have been checked in successfully!' });
      toast.success('Checked into today\u2019s queue');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <main className="auth-page">
      <Link className="brand" to="/" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}><RxFlowLogo size="medium"/></Link>
      <section className="auth-card">
        <p className="eyebrow">Patient Check-In</p>
        <h1>Welcome to the Clinic</h1>
        {status ? (
          <div className="checkin-success">
            <CheckCircle2 size={40} color="#059669" />
            <h2>Token #{String(status.queueNumber).padStart(2, '0')}</h2>
            <p>{status.message}</p>
          </div>
        ) : (
          <div>
            <p>Scan successful. Click below to confirm your arrival and get your queue token number.</p>
            <button className="button full" disabled={checkIn.isPending} onClick={() => checkIn.mutate()}>
              {checkIn.isPending ? 'Checking inâ€¦' : 'Check In Now'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function AppointmentBoardPage() {
  const [filter, setFilter] = useState<'all' | 'today'>('all');
  const dateParam = filter === 'today' ? today : 'all';

  const appointments = useQuery({
    queryKey: ['appointments', dateParam],
    queryFn: async () => (await client.get('/appointments/board', { params: { date: dateParam } })).data.data as Appointment[],
    refetchInterval: 5000,
  });

  return (
    <Page title="Appointment board" subtitle="Clinic appointments and WhatsApp bookings scheduled for doctor.">
      <section className="panel">
        <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="eyebrow">Scheduled Appointments</p>
            <h2>{filter === 'today' ? "Today's Appointments" : "All Doctor Appointments"}</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className={`button small ${filter === 'all' ? '' : 'ghost'}`}
              onClick={() => setFilter('all')}
            >
              All Appointments
            </button>
            <button
              className={`button small ${filter === 'today' ? '' : 'ghost'}`}
              onClick={() => setFilter('today')}
            >
              Today Only
            </button>
            <button className="button small ghost" onClick={() => void appointments.refetch()}>
              Refresh board
            </button>
          </div>
        </div>
        {appointments.isLoading ? (
          <p className="muted">Loading appointments…</p>
        ) : appointments.isError ? (
          <AsyncError error={appointments.error} message="Unable to load appointments" retry={() => void appointments.refetch()} />
        ) : appointments.data?.length ? (
          <div className="history-list">
            {appointments.data.map((item) => {
              const pName = typeof item.patientId === 'object' && item.patientId?.name ? item.patientId.name : item.patientName || 'Patient';
              const dName = typeof item.doctorId === 'object' && item.doctorId?.name ? item.doctorId.name : item.doctorName || 'Doctor';
              const apptDate = new Date(item.scheduledAt);
              const dateStr = apptDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
              const timeStr = apptDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
              const isWhatsApp = item.bookingSource === 'whatsapp_twilio';

              return (
                <article key={item._id} className="appointment-card" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color, #e5e7eb)', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1.05rem' }}>{pName}</strong>
                    <StatusBadge status={item.status} />
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #4b5563)' }}>
                    <span>📅 {dateStr} at 🕐 {timeStr} ({item.durationMinutes} mins)</span>
                    {dName && <span style={{ marginLeft: '12px' }}>👨‍⚕️ {dName}</span>}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span className={`badge ${isWhatsApp ? 'whatsapp-badge' : ''}`} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: isWhatsApp ? '#dcfce7' : '#f3f4f6', color: isWhatsApp ? '#166534' : '#374151', fontWeight: 500 }}>
                      {isWhatsApp ? '📱 Booked via WhatsApp' : '🏥 In-Clinic'}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty title={filter === 'today' ? "No appointments today" : "No appointments scheduled"} copy="Appointments created by patients via WhatsApp or by staff will appear here." />
        )}
      </section>
    </Page>
  );
}

function FuturePage() { const location = useLocation(); const name = futurePages.find((item) => location.pathname.toLowerCase().includes(item.split(' ')[0].toLowerCase())) || 'This feature'; return <div className="future-page"><span className="feature-icon"><Clock3/></span><p className="eyebrow">Coming after backend verification</p><h1>{name} is on the RxFlow roadmap.</h1><p>This interface will only become active when its API, clinic isolation, validation, audit records, and tests are ready.</p><Link className="button" to="/app">Back to dashboard</Link></div>; }
function Legal({ title }: { title: string }) { return <main className="legal"><Link className="brand" to="/" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}><RxFlowLogo size="medium"/></Link><h1>{title}</h1><p>RxFlow AI is designed around clinic-scoped access, explicit authentication, and clinician control. This page will be completed with your final legal and data-processing terms before production launch.</p></main>; }

export function App() { return <ErrorBoundary><AuthProvider><Routes><Route path="/" element={<Marketing/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/staff-login" element={<LoginPage staff/>}/><Route path="/doctor-login" element={<LoginPage staff/>}/><Route path="/signup" element={<SignupPage/>}/><Route path="/forgot-password" element={<ForgotPasswordPage/>}/><Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/feedback/:token" element={<PatientFeedbackPage/>}/><Route path="/checkin/:token" element={<PublicQrCheckInPage/>}/><Route path="/p/prescriptions/:token" element={<PublicPrescriptionPage/>}/><Route path="/prescription/:token" element={<PublicPrescriptionPage/>}/><Route path="/mfa" element={<Navigate to="/app" replace/>}/><Route path="/privacy" element={<Legal title="Privacy"/>}/><Route path="/terms" element={<Legal title="Terms of service"/>}/><Route element={<RequireAuth/>}><Route path="/change-password" element={<ChangePasswordPage/>}/><Route path="/app" element={<AppShell/>}><Route index element={<Dashboard/>}/><Route path="patients" element={<DoctorOnly><PatientRegistryPage/></DoctorOnly>}/><Route path="patients/:id" element={<DoctorOnly><PatientProfilePage/></DoctorOnly>}/><Route path="queue" element={<DoctorOnly><DailyQueuePage/></DoctorOnly>}/><Route path="appointments" element={<DoctorOnly><AppointmentBoardPage/></DoctorOnly>}/><Route path="communications" element={<DoctorOnly><CommunicationsPage/></DoctorOnly>}/><Route path="inventory" element={<DoctorOnly><InventoryPage/></DoctorOnly>}/><Route path="qr" element={<DoctorOnly><QrResolutionPage/></DoctorOnly>}/><Route path="prescription/new" element={<DoctorOnly><PrescriptionEditor/></DoctorOnly>}/><Route path="prescriptions/:id/workspace" element={<DoctorOnly><PrescriptionWorkspace/></DoctorOnly>}/><Route path="jarvis" element={<JarvisWorkspace/>}/><Route path="analytics" element={<OperationalAnalyticsPage/>}/><Route path="dropout" element={<DropoutRadarPage/>}/><Route path="feedback" element={<ClinicFeedbackPage/>}/><Route path="settings" element={<AdminOnly><AdminSettingsPage/></AdminOnly>}/>{futurePages.map((name) => <Route key={name} path={name.toLowerCase().replaceAll(' ', '-')} element={<FuturePage/>}/>)}</Route></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></AuthProvider></ErrorBoundary>; }

