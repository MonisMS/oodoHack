import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../../../components/ops/errors';
import { date, label, money } from '../../../components/ops/format';
import { useDebounced, useListParams } from '../../../components/ops/hooks';
import { Button, DataTable, Field, inputClass, Notice, Pagination, type Column } from '../../../components/ops/ui';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { Payment, PaymentMethod, PaymentQuery } from '../../../types/api';
import { usePayments } from '../api';
import { RecordPaymentDialog } from '../components/RecordPaymentDialog';

const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD'];

const columns: Column<Payment>[] = [
  { header: 'Date', cell: p => date(p.date), className: 'whitespace-nowrap' },
  { header: 'Invoice', cell: p => <Link className="font-medium text-brand-700 hover:underline" to={`/invoices/${p.invoiceId}`}>{p.invoiceNumber ?? 'View invoice'}</Link> },
  { header: 'Customer', cell: p => p.customerName ?? '—' },
  { header: 'Method', cell: p => label(p.method) },
  { header: 'Amount', cell: p => money(p.amount), align: 'right' },
  { header: 'Note', cell: p => p.note ?? '—', className: 'max-w-xs truncate' },
];

export default function PaymentsPage() {
  const list = useListParams(20);
  const urlSearch = list.get('search');
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search.trim());
  const { set } = list;
  useEffect(() => { if (debounced !== urlSearch) set({ search: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const [recorded, setRecorded] = useState<Payment | null>(null);
  const query: PaymentQuery = { ...list.query(), sortBy: 'date', sortOrder: 'desc' } as PaymentQuery;
  const { data, isLoading, error, refetch } = usePayments(query);

  return <>
    <PageHeader title="Payments" description="Every payment recorded against an invoice." actions={<Button variant="primary" onClick={() => { setRecorded(null); setOpen(true); }}>Record payment</Button>} />
    {recorded && <div className="mb-4"><Notice tone="success" title="Payment recorded" onDismiss={() => setRecorded(null)}>{money(recorded.amount)} against {recorded.invoiceNumber ?? 'the invoice'} on {date(recorded.date)}.</Notice></div>}
    <form role="search" onSubmit={e => e.preventDefault()} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Search" hint="Invoice number or customer">{f => <input {...f} type="search" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} />}</Field>
      <Field label="Method">{f => <select {...f} className={inputClass} value={list.get('method')} onChange={e => list.set({ method: e.target.value })}><option value="">All methods</option>{METHODS.map(m => <option key={m} value={m}>{label(m)}</option>)}</select>}</Field>
      <Field label="Paid from">{f => <input {...f} type="date" className={inputClass} value={list.get('from')} max={list.get('to') || undefined} onChange={e => list.set({ from: e.target.value })} />}</Field>
      <Field label="Paid to">{f => <input {...f} type="date" className={inputClass} value={list.get('to')} min={list.get('from') || undefined} onChange={e => list.set({ to: e.target.value })} />}</Field>
    </form>
    {error ? <div className="space-y-3"><ErrorNotice error={error} /><Button onClick={() => void refetch()}>Try again</Button></div> : <>
      <DataTable caption="Payments" columns={columns} rows={data?.data} rowKey={p => p.id} loading={isLoading} empty="No payments match these filters yet." />
      {data && data.total > 0 && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={page => list.set({ page })} />}
    </>}
    {open && <RecordPaymentDialog onClose={() => setOpen(false)} onRecorded={payment => { setOpen(false); setRecorded(payment); }} />}
  </>;
}
