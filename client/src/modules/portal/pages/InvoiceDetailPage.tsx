import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, DataTable, Facts, StatusBadge, type Column } from '../../../components/ops/ui';
import { date, label, money } from '../../../components/ops/format';
import type { InvoiceLine, PortalPayment } from '../../../types/api';
import { usePortalInvoice } from '../api';
import { BackLink, QueryState } from '../components/Shared';

const lineColumns: Column<InvoiceLine>[] = [
  { header: 'Description', cell: l => <>{l.description}{l.taxes.length > 0 && <span className="block text-xs text-slate-500">{l.taxes.map(t => `${t.name} ${Number(t.percentage)}% (${money(t.amount)})`).join(', ')}</span>}</> },
  { header: 'Qty', align: 'right', cell: l => l.kind === 'DISCOUNT' ? '—' : l.quantity },
  { header: 'Unit price', align: 'right', cell: l => l.kind === 'DISCOUNT' ? '—' : money(l.unitPrice) },
  { header: 'Tax', align: 'right', cell: l => money(l.taxTotal) },
  { header: 'Amount', align: 'right', cell: l => money(l.total) },
];
const paymentColumns: Column<PortalPayment>[] = [
  { header: 'Date', cell: p => date(p.date) }, { header: 'Method', cell: p => label(p.method) }, { header: 'Amount', align: 'right', cell: p => money(p.amount) },
];

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const query = usePortalInvoice(id);
  const inv = query.data;
  return <div className="space-y-6">
    <BackLink to="/portal/invoices">All invoices</BackLink>
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} />
    {inv && <>
      <PageHeader title={`Invoice ${inv.number}`} actions={<Link to={`/portal/invoices/${inv.id}/print`} className="inline-flex items-center rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">Print / download</Link>} />
      <Card><Facts items={[
        ['Status', <span key="s" className="flex gap-2"><StatusBadge status={inv.status} />{inv.overdue && <StatusBadge status="OVERDUE" />}</span>],
        ['Issued', date(inv.issueDate)], ['Due', date(inv.dueDate)], ['Service period', `${date(inv.periodStart)} – ${date(inv.periodEnd)}`],
      ]} /></Card>
      <Card title="Items"><DataTable caption="Invoice items" columns={lineColumns} rows={inv.lines} rowKey={l => l.id} empty="No items." /></Card>
      <Card title="Totals"><dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{money(inv.subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Discounts</dt><dd className="tabular-nums">{money(inv.discountTotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd className="tabular-nums">{money(inv.taxTotal)}</dd></div>
        <div className="flex justify-between border-t pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(inv.total)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="tabular-nums">{money(inv.amountPaid)}</dd></div>
        <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{money(inv.outstanding)}</dd></div>
      </dl></Card>
      <Card title="Payments received"><DataTable caption="Payments received" columns={paymentColumns} rows={inv.payments} rowKey={p => p.id} empty="No payments received yet." /></Card>
    </>}
  </div>;
}
