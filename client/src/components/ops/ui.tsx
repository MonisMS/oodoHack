import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { label } from './format';

// A small, dependency-free kit for the operational screens (subscriptions, invoices, payments, billing, taxes, portal).
// Plain Tailwind, accessible by default: labelled fields, focus rings (from styles.css), dialog semantics, status by text + colour.

export const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-slate-300',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-slate-400',
};
export function Button({ variant = 'secondary', busy, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return <button type="button" {...rest} disabled={rest.disabled || busy} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}>{busy && <Spinner small />}{children}</button>;
}

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="Loading" className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-3.5 w-3.5' : 'h-5 w-5'}`} />;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border bg-white shadow-sm ${className}`}>{(title || actions) && <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"><h2 className="text-sm font-semibold text-slate-700">{title}</h2>{actions}</header>}<div className="p-5">{children}</div></section>;
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', blue: 'bg-sky-50 text-sky-700 ring-sky-600/20', amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20', slate: 'bg-slate-100 text-slate-700 ring-slate-500/20', violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};
const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'green', PAID: 'green', CONFIRMED: 'blue', QUOTATION: 'violet', DRAFT: 'slate', PAUSED: 'amber', PARTIALLY_PAID: 'amber', CLOSED: 'slate', CANCELLED: 'red', OVERDUE: 'red',
};
/** Status is always shown as text (never colour alone). */
export function StatusBadge({ status, tone }: { status: string; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone ?? STATUS_TONE[status] ?? 'slate']}`}>{label(status)}</span>;
}

export function Notice({ tone = 'info', title, children, onDismiss }: { tone?: 'info' | 'success' | 'error' | 'warning'; title?: string; children?: ReactNode; onDismiss?: () => void }) {
  const styles = { info: 'border-sky-200 bg-sky-50 text-sky-900', success: 'border-emerald-200 bg-emerald-50 text-emerald-900', error: 'border-rose-200 bg-rose-50 text-rose-900', warning: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}><div>{title && <p className="font-medium">{title}</p>}{children && <div className={title ? 'mt-1' : ''}>{children}</div>}</div>{onDismiss && <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-lg leading-none opacity-60 hover:opacity-100">×</button>}</div>;
}

/** A labelled form field with its error message wired up for assistive tech. */
export function Field({ label: text, error, hint, children, className = '' }: { label: string; error?: string[] | string; hint?: string; children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode; className?: string }) {
  const id = useId(); const message = Array.isArray(error) ? error.join(' ') : error;
  return <div className={className}><label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{text}</label>{children({ id, 'aria-invalid': Boolean(message), 'aria-describedby': message ? `${id}-error` : hint ? `${id}-hint` : undefined })}{hint && !message && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}{message && <p id={`${id}-error`} className="mt-1 text-xs text-rose-600">{message}</p>}</div>;
}

export interface Column<T> { header: string; cell: (row: T) => ReactNode; className?: string; align?: 'right' }
export function DataTable<T>({ columns, rows, rowKey, loading, empty, caption, onRowClick }: { columns: Column<T>[]; rows: T[] | undefined; rowKey: (row: T) => string; loading?: boolean; empty: ReactNode; caption: string; onRowClick?: (row: T) => void }) {
  if (loading && !rows) return <div className="flex justify-center rounded-xl border bg-white p-10"><Spinner /></div>;
  if (!rows?.length) return <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">{empty}</div>;
  return <div className="overflow-x-auto rounded-xl border bg-white shadow-sm"><table className="min-w-full divide-y divide-slate-200 text-sm"><caption className="sr-only">{caption}</caption>
    <thead className="bg-slate-50"><tr>{columns.map(c => <th key={c.header} scope="col" className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.header}</th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}>{columns.map(c => <td key={c.header} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className ?? ''}`}>{c.cell(row)}</td>)}</tr>)}</tbody></table></div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize)); const from = total === 0 ? 0 : (page - 1) * pageSize + 1; const to = Math.min(total, page * pageSize);
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-slate-600"><p>{from}–{to} of {total.toLocaleString('en-IN')}</p><div className="flex items-center gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button></div></nav>;
}

/** Accessible modal: focus moves in, Escape closes, the page behind is inert to the screen reader. */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const titleId = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.focus(); const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', onKey); return () => { document.removeEventListener('keydown', onKey); previous?.focus(); }; }, [onClose]);
  return <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-xl bg-white shadow-xl outline-none`}>
      <header className="flex items-center justify-between border-b px-5 py-3"><h2 id={titleId} className="text-base font-semibold">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-700">×</button></header>
      <div className="px-5 py-4">{children}</div>{footer && <footer className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">{footer}</footer>}
    </div></div>;
}

/** Definition list for read-only facts. */
export function Facts({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">{items.map(([term, value]) => <div key={term}><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{term}</dt><dd className="mt-0.5 text-sm text-slate-900">{value}</dd></div>)}</dl>;
}
