import { Link } from 'react-router-dom';
import { date, dateTime, label, money } from '../../../components/ops/format';
import { Card, DataTable, Facts, StatusBadge, type Column } from '../../../components/ops/ui';
import type { Invoice, InvoiceLine, Payment } from '../../../types/api';

const lineColumns: Column<InvoiceLine>[] = [
  { header: 'Description', cell: l => <><span className={l.kind === 'DISCOUNT' ? 'text-emerald-700' : ''}>{l.description}</span>{l.kind === 'DISCOUNT' && <span className="ml-2 text-xs text-slate-500">Discount</span>}</> },
  { header: 'Qty', cell: l => l.quantity, align: 'right' },
  { header: 'Unit price', cell: l => money(l.unitPrice), align: 'right' },
  { header: 'Subtotal', cell: l => money(l.subtotal), align: 'right' },
  { header: 'Taxes', cell: l => l.taxes.length ? <ul>{l.taxes.map(t => <li key={t.taxId} className="whitespace-nowrap text-xs">{t.name} ({t.percentage}%): {money(t.amount)}</li>)}</ul> : <span className="text-slate-400">None</span> },
  { header: 'Total', cell: l => money(l.total), align: 'right' },
];

const paymentColumns: Column<Payment>[] = [
  { header: 'Date', cell: p => date(p.date) },
  { header: 'Method', cell: p => label(p.method) },
  { header: 'Amount', cell: p => money(p.amount), align: 'right' },
  { header: 'Note', cell: p => p.note ?? '—' },
];

/** Read-only view of an invoice. Every amount is the server's value. */
export function InvoiceBody({ invoice }: { invoice: Invoice }) {
  const totals: Array<[string, string, boolean?]> = [
    ['Subtotal', invoice.subtotal], ['Discounts', invoice.discountTotal], ['Tax', invoice.taxTotal], ['Total', invoice.total, true], ['Paid', invoice.amountPaid], ['Balance due', invoice.outstanding, true],
  ];
  return <div className="space-y-6">
    <Card title="Details"><Facts items={[
      ['Customer', <>{invoice.customerName}<span className="block text-xs text-slate-500">{invoice.customerEmail}</span></>],
      ['Subscription', <Link className="text-brand-700 hover:underline" to={`/subscriptions/${invoice.subscriptionId}`}>View subscription</Link>],
      ['Issue date', date(invoice.issueDate)],
      ['Due date', <span key="due" className="inline-flex flex-wrap items-center gap-2">{date(invoice.dueDate)}{invoice.overdue && <StatusBadge status="OVERDUE" />}</span>],
      ['Service period', `${date(invoice.periodStart)} – ${date(invoice.periodEnd)}`],
      ['Emailed', invoice.sentAt ? dateTime(invoice.sentAt) : 'Not sent yet'],
      ['Reminders', invoice.reminderCount === 0 ? 'None sent' : `${invoice.reminderCount} sent, last ${dateTime(invoice.lastReminderAt)}`],
    ]} /></Card>
    <Card title="Lines"><div className="-m-5"><DataTable caption="Invoice lines" columns={lineColumns} rows={invoice.lines} rowKey={l => l.id} empty="This invoice has no lines." /></div>
      <dl className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">{totals.map(([name, value, strong]) => <div key={name} className={`flex justify-between ${strong ? 'border-t pt-1 font-semibold' : ''}`}><dt className="text-slate-500">{name}</dt><dd className="tabular-nums">{money(value)}</dd></div>)}</dl></Card>
    <Card title="Payments"><div className="-m-5"><DataTable caption="Payments on this invoice" columns={paymentColumns} rows={invoice.payments} rowKey={p => p.id} empty="No payments recorded yet." /></div></Card>
  </div>;
}
