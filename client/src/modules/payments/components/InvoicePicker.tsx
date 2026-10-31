import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { api, queryString } from '../../../lib/api';
import { ErrorNotice } from '../../../components/ops/errors';
import { money } from '../../../components/ops/format';
import { useDebounced } from '../../../components/ops/hooks';
import { Field, inputClass, Spinner } from '../../../components/ops/ui';
import type { Invoice, InvoiceStatus, Page } from '../../../types/api';

const OPEN: InvoiceStatus[] = ['PARTIALLY_PAID', 'CONFIRMED'];

/** Search box plus a radio list of invoices that can still take a payment (confirmed or partially paid). */
export function InvoicePicker({ selectedId, onSelect }: { selectedId: string; onSelect: (invoice: Invoice) => void }) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const results = useQueries({
    queries: OPEN.map(status => ({
      queryKey: ['invoices', 'open-picker', status, debounced],
      queryFn: () => api<Page<Invoice>>(`/invoices${queryString({ status, search: debounced || undefined, pageSize: 20, sortBy: 'dueDate', sortOrder: 'asc' })}`),
    })),
  });
  const loading = results.some(r => r.isLoading);
  const failure = results.find(r => r.error)?.error;
  const invoices = results.flatMap(r => r.data?.data ?? []);
  return <fieldset className="space-y-3">
    <legend className="mb-1 text-sm font-medium text-slate-700">Invoice</legend>
    <Field label="Search open invoices" hint="Invoice number, customer name or email">{f => <input {...f} type="search" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} />}</Field>
    {failure ? <ErrorNotice error={failure} /> : loading ? <div className="flex justify-center p-4"><Spinner /></div> : invoices.length === 0
      ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-slate-500">No open invoices match. Only confirmed or partially paid invoices can receive a payment.</p>
      : <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">{invoices.map(invoice => <li key={invoice.id}>
        <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-slate-50">
          <input type="radio" name="payment-invoice" className="mt-1" checked={selectedId === invoice.id} onChange={() => onSelect(invoice)} />
          <span className="flex-1"><span className="font-medium">{invoice.number}</span> · {invoice.customerName}<span className="block text-xs text-slate-500">Outstanding {money(invoice.outstanding)}{invoice.overdue ? ' · Overdue' : ''}</span></span>
        </label></li>)}</ul>}
  </fieldset>;
}
