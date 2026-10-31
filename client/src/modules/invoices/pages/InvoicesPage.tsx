import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../../../components/ops/errors';
import { date, label, money } from '../../../components/ops/format';
import { useDebounced, useListParams } from '../../../components/ops/hooks';
import { Button, DataTable, Field, inputClass, Pagination, StatusBadge, type Column } from '../../../components/ops/ui';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { Id, Invoice, InvoiceQuery, InvoiceStatus } from '../../../types/api';
import { useInvoices } from '../api';
import { BulkActions } from '../components/BulkActions';

const STATUSES: InvoiceStatus[] = ['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];
const SORTS = [
  { value: 'createdAt:desc', text: 'Recently created' },
  { value: 'date:desc', text: 'Issue date, newest first' },
  { value: 'date:asc', text: 'Issue date, oldest first' },
  { value: 'dueDate:asc', text: 'Due date, soonest first' },
  { value: 'dueDate:desc', text: 'Due date, latest first' },
];

export default function InvoicesPage() {
  const list = useListParams(20);
  const urlSearch = list.get('search');
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search.trim());
  const { set } = list;
  useEffect(() => { if (debounced !== urlSearch) set({ search: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<Map<Id, string>>(new Map());
  const query = list.query() as InvoiceQuery;
  const { data, isLoading, error, refetch } = useInvoices(query);
  const rows = data?.data;
  const allOnPage = Boolean(rows?.length) && rows!.every(r => selected.has(r.id));

  const toggle = (invoice: Invoice) => setSelected(previous => { const next = new Map(previous); if (next.has(invoice.id)) next.delete(invoice.id); else next.set(invoice.id, invoice.number); return next; });
  const toggleAll = () => setSelected(previous => { const next = new Map(previous); for (const r of rows ?? []) { if (allOnPage) next.delete(r.id); else next.set(r.id, r.number); } return next; });
  const sort = `${list.get('sortBy') || 'createdAt'}:${list.get('sortOrder') || 'desc'}`;

  const columns: Column<Invoice>[] = [
    { header: 'Select', cell: i => <input type="checkbox" aria-label={`Select invoice ${i.number}`} checked={selected.has(i.id)} onChange={() => toggle(i)} /> },
    { header: 'Number', cell: i => <Link className="font-medium text-brand-700 hover:underline" to={`/invoices/${i.id}`}>{i.number}</Link>, className: 'whitespace-nowrap' },
    { header: 'Customer', cell: i => i.customerName },
    { header: 'Issued', cell: i => date(i.issueDate), className: 'whitespace-nowrap' },
    { header: 'Due', cell: i => <span className="inline-flex flex-wrap items-center gap-2 whitespace-nowrap">{date(i.dueDate)}{i.overdue && <StatusBadge status="OVERDUE" />}</span> },
    { header: 'Total', cell: i => money(i.total), align: 'right' },
    { header: 'Outstanding', cell: i => money(i.outstanding), align: 'right' },
    { header: 'Status', cell: i => <StatusBadge status={i.status} /> },
  ];

  return <>
    <PageHeader title="Invoices" description="Review, confirm, send and collect payment on invoices."
      actions={<Link to="/billing" className="inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">Run billing</Link>} />
    <form role="search" onSubmit={e => e.preventDefault()} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Search" hint="Number, customer name or email">{f => <input {...f} type="search" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} />}</Field>
      <Field label="Status">{f => <select {...f} className={inputClass} value={list.get('status')} onChange={e => list.set({ status: e.target.value })}><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>}</Field>
      <Field label="Sort by">{f => <select {...f} className={inputClass} value={sort} onChange={e => { const [sortBy, sortOrder] = e.target.value.split(':'); list.set({ sortBy, sortOrder }); }}>{SORTS.map(s => <option key={s.value} value={s.value}>{s.text}</option>)}</select>}</Field>
      <Field label="Issued from">{f => <input {...f} type="date" className={inputClass} value={list.get('from')} max={list.get('to') || undefined} onChange={e => list.set({ from: e.target.value })} />}</Field>
      <Field label="Issued to">{f => <input {...f} type="date" className={inputClass} value={list.get('to')} min={list.get('from') || undefined} onChange={e => list.set({ to: e.target.value })} />}</Field>
      <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={list.get('overdue') === 'true'} onChange={e => list.set({ overdue: e.target.checked ? 'true' : '' })} />Overdue only</label></div>
    </form>
    <div className="mb-3"><BulkActions selected={selected} onClear={() => setSelected(new Map())} /></div>
    {error ? <div className="space-y-3"><ErrorNotice error={error} /><Button onClick={() => void refetch()}>Try again</Button></div> : <>
      {rows && rows.length > 0 && <label className="mb-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allOnPage} onChange={toggleAll} />Select all invoices on this page</label>}
      <DataTable caption="Invoices" columns={columns} rows={rows} rowKey={i => i.id} loading={isLoading} empty="No invoices match these filters. Run billing to create draft invoices for subscriptions that are due." />
      {data && data.total > 0 && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={page => list.set({ page })} />}
    </>}
  </>;
}
