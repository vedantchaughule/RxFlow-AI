import type { ReactNode } from 'react';
import { ClipboardList, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';

type StateKind = 'empty' | 'error' | 'forbidden' | 'offline' | 'reconnect';
const icons = { empty: ClipboardList, error: ShieldCheck, forbidden: ShieldCheck, offline: WifiOff, reconnect: RefreshCw };

export function StateView({ kind, title, message, action, compact = true }: { kind: StateKind; title: string; message: string; action?: ReactNode; compact?: boolean }) {
  const Icon = icons[kind];
  return <section className={`${compact ? 'empty' : 'connection-state'} state-view state-${kind}`} role={kind === 'error' || kind === 'forbidden' ? 'alert' : 'status'}><Icon aria-hidden="true"/><h3>{title}</h3><p>{message}</p>{action}</section>;
}

export function LoadingSkeleton({ label = 'Loading content', rows = 3 }: { label?: string; rows?: number }) {
  return <div className="loading-skeleton" role="status" aria-label={label}><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, index) => <span key={index} aria-hidden="true"/>)}</div>;
}
