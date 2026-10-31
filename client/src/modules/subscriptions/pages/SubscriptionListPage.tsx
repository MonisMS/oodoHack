import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorNotice } from '../../../components/ops/errors';
import { date, label } from '../../../components/ops/format';
import { useDebounced, useListParams } from '../../../components/ops/hooks';
import { usePlans } from '../../../components/ops/pickers';
import { Button, DataTable, Field, inputClass, Pagination, StatusBadge } from '../../../components/ops/ui';
import type { SubscriptionStatus } from '../../../types/api';
import { useSubscriptions } from '../api';
import { FromTemplateModal } from '../components/FromTemplateModal';

const STATUSES: SubscriptionStatus[] = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED'];

export default function SubscriptionListPage() {
  const list = useListParams(20); const navigate = useNavigate();
  const [search, setSearch] = useState(list.get('search'));
  const [fromTemplate, setFromTemplate] = useState(false);
  const debounced = useDebounced(search);
  const current = list.get('search');
  useEffect(() => { if (debounced !== current) list.set({ search: debounced }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  const plans = usePlans().data?.data;
  const { data, isLoading, error, refetch } = useSubscriptions(list.query());
  const filtered = Boolean(current || list.get('status') || list.get('planId') || list.get('customerId'));
  return <>
    <PageHeader title="Subscriptions" description="Every subscription and where it is in its life cycle." actions={<div className="flex flex-wrap gap-2">
      <Button onClick={() => setFromTemplate(true)}>From template</Button>
      <Link to="/subscriptions/new" className="inline-flex rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">New subscription</Link>
    </div>} />
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <Field label="Search" hint="Number, customer name or email">{f => <input {...f} type="search" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} />}</Field>
      <Field label="Status">{f => <select {...f} className={inputClass} value={list.get('status')} onChange={e => list.set({ status: e.target.value })}><option value="">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{label(s)}</option>)}</select>}</Field>
      <Field label="Plan">{f => <select {...f} className={inputClass} value={list.get('planId')} onChange={e => list.set({ planId: e.target.value })}><option value="">All plans</option>{plans?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</Field>
    </div>
    {list.get('customerId') && <p className="mb-3 text-sm text-slate-600">Showing one customer&rsquo;s subscriptions. <button type="button" className="text-brand-700 underline" onClick={() => list.set({ customerId: undefined })}>Show all</button></p>}
    {error ? <div className="space-y-3"><ErrorNotice error={error} title="Subscriptions could not be loaded" /><Button onClick={() => void refetch()}>Try again</Button></div> : <>
      <DataTable caption="Subscriptions" loading={isLoading} rows={data?.data} rowKey={s => s.id} onRowClick={s => navigate(`/subscriptions/${s.id}`)}
        empty={<EmptyState title="No subscriptions found">{filtered ? 'Nothing matches these filters.' : 'Create the first subscription to get started.'}</EmptyState>}
        columns={[
          { header: 'Number', cell: s => <Link to={`/subscriptions/${s.id}`} className="font-medium text-brand-700 hover:underline" onClick={e => e.stopPropagation()}>{s.number}</Link> },
          { header: 'Customer', cell: s => <><div>{s.customerName}</div><div className="text-xs text-slate-500">{s.customerEmail}</div></> },
          { header: 'Plan', cell: s => s.planName },
          { header: 'Status', cell: s => <div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={s.status} />{s.billingDue && <StatusBadge status="BILLING_DUE" tone="amber" />}{s.cancelAtPeriodEnd && <StatusBadge status="ENDS_AT_PERIOD_END" tone="red" />}{s.quotationExpired && <StatusBadge status="QUOTE_EXPIRED" tone="red" />}</div> },
          { header: 'Start', cell: s => date(s.startDate) },
          { header: 'Next invoice', cell: s => date(s.nextInvoiceDate) },
        ]} />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={p => list.set({ page: p })} />}
    </>}
    {fromTemplate && <FromTemplateModal onClose={() => setFromTemplate(false)} />}
  </>;
}
