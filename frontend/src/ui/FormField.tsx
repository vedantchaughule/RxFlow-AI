import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

export function Field({ id, label, error, hint, children, className = '' }: { id: string; label: string; error?: string; hint?: ReactNode; children: ReactElement; className?: string }) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children) ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy } as Record<string, unknown>) : children;
  return <label className={className} htmlFor={id}>{label}{control}{hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</label>;
}

export function FormError({ children }: { children?: ReactNode }) {
  return children ? <div className="form-error" role="alert">{children}</div> : null;
}
