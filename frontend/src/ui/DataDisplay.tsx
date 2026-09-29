import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

export function ResponsiveDataList<T>({ label, rows, rowKey, renderRow, renderCard = renderRow }: { label: string; rows: T[]; rowKey: (row: T) => string; renderRow: (row: T) => ReactNode; renderCard?: (row: T) => ReactNode }) {
  return <div className="responsive-data" aria-label={label}><div className="data-table" role="list" aria-label={label}>{rows.map((row) => <div role="listitem" key={rowKey(row)}>{renderRow(row)}</div>)}</div><div className="mobile-card-list" aria-label={`${label} mobile cards`}>{rows.map((row) => <article key={rowKey(row)}>{renderCard(row)}</article>)}</div></div>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status}`} aria-label={`Status: ${status.replaceAll('_', ' ')}`}>{status.replaceAll('_', ' ')}</span>;
}

export function SearchField({ value, onChange, label = 'Search', placeholder = 'Search' }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }) {
  return <label className="search-input"><Search aria-hidden="true" size={17}/><span className="sr-only">{label}</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label}/></label>;
}

export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="Pagination"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><span aria-live="polite">Page {page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button></nav>;
}
