import { useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { client, errorMessage, tokenStore } from '../../api';
import { useAuth } from '../../auth';
import { Field, FormError } from '../../ui/FormField';
import { notify } from '../../ui/Feedback';

import { RxFlowLogo } from '../../ui/RxFlowLogo';

function AuthCard({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return <main className="auth-page"><Link className="brand" to="/" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}><RxFlowLogo size="medium"/></Link><section className="auth-card"><p className="eyebrow">Clinic workspace</p><h1>{title}</h1><p>{copy}</p>{children}</section></main>;
}

function PasswordField({ label, value, onChange, current = false, guidance = false }: { label: string; value: string; onChange: (value: string) => void; current?: boolean; guidance?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <label>{label}<span className="password-field"><input aria-label={label} autoComplete={current ? 'current-password' : 'new-password'} required minLength={current ? undefined : 12} maxLength={128} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)}/><button type="button" aria-label={`${visible ? 'Hide' : 'Show'} password`} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span>{guidance && <small className={value.length >= 12 ? 'password-good' : ''}>Use at least 12 characters. A longer, unique passphrase is easier to remember and harder to guess.</small>}</label>;
}

function sessionMessage(reason: string | null) {
  if (reason === 'ACCOUNT_DISABLED') return 'Your account was disabled. Contact your clinic administrator.';
  return reason ? 'Your session expired. Sign in again to continue.' : null;
}

export function LoginPage({ staff = false }: { staff?: boolean }) {
  const { login, sessionReason } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  const state = location.state as { from?: { pathname?: string; search?: string }; notice?: string } | null;
  const notice = state?.notice ?? sessionMessage(sessionReason); const requested = `${state?.from?.pathname ?? ''}${state?.from?.search ?? ''}`; const returnTo = requested.startsWith('/app') ? requested : '/app';
  return <AuthCard title={staff ? 'Doctor sign in' : 'Welcome back'} copy={staff ? 'Doctors: use the temporary credentials your clinic administrator gave you.' : 'Sign in to your clinic workspace.'}>{notice && <p className="auth-notice" role="alert">{notice}</p>}<form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { const result = await login(email, password); navigate(result.mustChangePassword ? '/change-password' : returnTo, { replace: true }); } catch (error) { notify.error(errorMessage(error)); } finally { setBusy(false); } }}><label>Email<input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label><PasswordField label="Password" value={password} current onChange={setPassword}/><button className="button full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><p><Link to="/forgot-password">Forgot password?</Link></p>{staff ? <p>Clinic administrator? <Link to="/login">Administrator sign in</Link></p> : <><p>Doctor? <Link to="/staff-login">Doctor sign in</Link></p><p>New clinic? <Link to="/signup">Start your clinic</Link></p></>}</AuthCard>;
}

export function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState(''); const [busy, setBusy] = useState(false);
  return <AuthCard title="Choose your password" copy="You are signed in with a temporary password. Choose a new one to continue."><form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await client.post('/auth/password/complete-first-sign-in', { newPassword }); tokenStore.clear(); window.location.assign('/staff-login'); } catch (error) { notify.error(errorMessage(error)); setBusy(false); } }}><PasswordField label="New password (min. 12 characters)" value={newPassword} onChange={setNewPassword} guidance/><button className="button full" disabled={busy}>{busy ? 'Updating…' : 'Set new password'}</button></form></AuthCard>;
}

export function SignupPage() {
  const { establishSession } = useAuth(); const navigate = useNavigate();
  const [form, setForm] = useState({ clinicName: '', adminName: '', email: '', password: '' }); const [errors, setErrors] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const validate = () => { const next: Record<string, string> = {}; if (form.clinicName.trim().length < 2) next.clinicName = 'Enter at least 2 characters for the clinic name.'; if (form.adminName.trim().length < 2) next.adminName = 'Enter at least 2 characters for your name.'; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Enter a valid email address.'; if (form.password.length < 12) next.password = 'Use at least 12 characters for the password.'; setErrors(next); return Object.keys(next).length === 0; };
  return <AuthCard title="Start your clinic" copy="Create the first administrator account for your clinic."><form noValidate onSubmit={async (event) => { event.preventDefault(); if (!validate()) return; setBusy(true); try { const { data } = await client.post('/auth/clinic-signup', { ...form, email: form.email.trim() }); tokenStore.set(data.data.accessToken); await establishSession(); navigate('/app'); } catch (error) { notify.error(errorMessage(error)); } finally { setBusy(false); } }}><FormError>{Object.values(errors)[0]}</FormError><Field id="clinic-name" label="Clinic name" error={errors.clinicName}><input value={form.clinicName} onChange={(event) => setForm({ ...form, clinicName: event.target.value })}/></Field><Field id="admin-name" label="Your name" error={errors.adminName}><input value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })}/></Field><Field id="signup-email" label="Email" error={errors.email}><input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></Field><div className={errors.password ? 'field-invalid' : ''}><PasswordField label="Password" value={form.password} onChange={(password) => setForm({ ...form, password })} guidance/>{errors.password && <small className="field-error">{errors.password}</small>}</div><button className="button full" disabled={busy}>{busy ? 'Creating…' : 'Create clinic'}</button></form><p>Already have access? <Link to="/login">Sign in</Link></p></AuthCard>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  return <AuthCard title="Reset your password" copy="Enter the email used for your clinic account.">{sent ? <p className="auth-notice" role="status">If an active account matches that email, a short-lived reset link has been sent.</p> : <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await client.post('/auth/password/forgot', { email: email.trim() }); setSent(true); } catch (error) { notify.error(errorMessage(error)); } finally { setBusy(false); } }}><label>Email<input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)}/></label><button className="button full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button></form>}<p><Link to="/login">Back to sign in</Link></p></AuthCard>;
}

export function ResetPasswordPage() {
  const navigate = useNavigate(); const token = new URLSearchParams(useLocation().search).get('token') ?? ''; const [newPassword, setNewPassword] = useState(''); const [busy, setBusy] = useState(false);
  return <AuthCard title="Choose a new password" copy="Reset links are short-lived and work only once.">{!token ? <p className="auth-notice" role="alert">This reset link is missing or invalid. Request a new one.</p> : <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { const { data } = await client.post('/auth/password/reset', { token, newPassword }); tokenStore.clear(); navigate(data.data.loginPath || '/login', { replace: true, state: { notice: 'Password reset complete. Sign in with your new password.' } }); } catch (error) { notify.error(errorMessage(error)); setBusy(false); } }}><PasswordField label="New password" value={newPassword} onChange={setNewPassword} guidance/><button className="button full" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button></form>}<p><Link to="/forgot-password">Request a new link</Link></p></AuthCard>;
}
