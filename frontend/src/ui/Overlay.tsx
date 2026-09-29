import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useOverlayFocus(open: boolean, onClose: () => void, preferredFocus?: string) {
  const containerRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const items = container ? [...container.querySelectorAll<HTMLElement>(focusable)] : [];
    (preferredFocus ? container?.querySelector<HTMLElement>(preferredFocus) : items[0])?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || items.length === 0) return;
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); restoreRef.current?.focus(); };
  }, [open, onClose, preferredFocus]);
  return containerRef;
}

export function Modal({ open, title, children, onClose, danger = false }: { open: boolean; title: string; children: ReactNode; onClose: () => void; danger?: boolean }) {
  const ref = useOverlayFocus(open, onClose, '[data-autofocus]');
  if (!open) return null;
  return <div className="overlay-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className="modal" role={danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X/></button></header>{children}</section></div>;
}

export function ConfirmationDialog({ open, title, message, confirmLabel, busy, onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <Modal open={open} title={title} onClose={onCancel} danger><p>{message}</p><div className="dialog-actions"><button data-autofocus className="button ghost" onClick={onCancel}>Cancel</button><button className="button danger-button" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button></div></Modal>;
}
