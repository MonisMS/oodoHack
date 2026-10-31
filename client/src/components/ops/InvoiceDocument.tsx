import type { Invoice, PortalInvoice } from '../../types/api';
import { date, dateTime, label, money } from './format';
import { StatusBadge } from './ui';

// One printable invoice, used by the staff print page and the customer portal print page so both look identical.
// Everything shown is a frozen server value (totals, taxes, balances); nothing is calculated in the browser.
export function InvoiceDocument({ invoice }: { invoice: Invoice | PortalInvoice }) {
  const charges = invoice.lines.filter(l => l.kind === 'CHARGE'); const discounts = invoice.lines.filter(l => l.kind === 'DISCOUNT');
  return <article className="invoice-document mx-auto max-w-3xl rounded-xl border bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none" aria-label={`Invoice ${invoice.number}`}>
    <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
      <div><p className="text-xl font-bold tracking-tight text-brand-700">◈ Brightloop Software</p><p className="mt-1 text-xs text-slate-500">Subscriptions, made clear</p></div>
      <div className="text-right"><h1 className="text-2xl font-semibold">Invoice</h1><p className="mt-1 font-mono text-sm">{invoice.number}</p><div className="mt-2 flex justify-end gap-2"><StatusBadge status={invoice.status} />{invoice.overdue && <StatusBadge status="OVERDUE" />}</div></div>
    </header>
    <section className="grid gap-6 py-6 sm:grid-cols-2">
      <div><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed to</h2><p className="mt-1 font-medium">{invoice.customerName}</p><p className="text-sm text-slate-600">{invoice.customerEmail}</p></div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:justify-self-end">
        <dt className="text-slate-500">Issued</dt><dd className="text-right">{date(invoice.issueDate)}</dd>
        <dt className="text-slate-500">Due</dt><dd className="text-right font-medium">{date(invoice.dueDate)}</dd>
        <dt className="text-slate-500">Service period</dt><dd className="text-right">{date(invoice.periodStart)} – {date(invoice.periodEnd)}</dd>
      </dl>
    </section>
    <table className="w-full text-sm"><caption className="sr-only">Invoice lines</caption>
      <thead><tr className="border-y bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th scope="col" className="px-3 py-2">Description</th><th scope="col" className="px-3 py-2 text-right">Qty</th><th scope="col" className="px-3 py-2 text-right">Unit price</th><th scope="col" className="px-3 py-2 text-right">Tax</th><th scope="col" className="px-3 py-2 text-right">Amount</th></tr></thead>
      <tbody className="divide-y">{charges.map(l => <tr key={l.id}><td className="px-3 py-2">{l.description}{l.taxes.length > 0 && <span className="block text-xs text-slate-500">{l.taxes.map(t => `${t.name}`).join(', ')}</span>}</td><td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{money(l.unitPrice)}</td><td className="px-3 py-2 text-right tabular-nums">{money(l.taxTotal)}</td><td className="px-3 py-2 text-right tabular-nums">{money(l.total)}</td></tr>)}
        {discounts.map(l => <tr key={l.id} className="text-emerald-700"><td className="px-3 py-2">{l.description}</td><td className="px-3 py-2 text-right">—</td><td className="px-3 py-2 text-right">—</td><td className="px-3 py-2 text-right tabular-nums">{money(l.taxTotal)}</td><td className="px-3 py-2 text-right tabular-nums">{money(l.total)}</td></tr>)}</tbody></table>
    <dl className="ml-auto mt-6 w-full max-w-xs space-y-1 text-sm">
      <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{money(invoice.subtotal)}</dd></div>
      {Number(invoice.discountTotal) !== 0 && <div className="flex justify-between text-emerald-700"><dt>Discounts</dt><dd className="tabular-nums">−{money(invoice.discountTotal)}</dd></div>}
      <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd className="tabular-nums">{money(invoice.taxTotal)}</dd></div>
      <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(invoice.total)}</dd></div>
      <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="tabular-nums">{money(invoice.amountPaid)}</dd></div>
      <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{money(invoice.outstanding)}</dd></div>
    </dl>
    {invoice.payments.length > 0 && <section className="mt-8"><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments received</h2><ul className="mt-2 divide-y text-sm">{invoice.payments.map(p => <li key={p.id} className="flex justify-between py-1.5"><span>{date(p.date)} · {label(p.method)}</span><span className="tabular-nums">{money(p.amount)}</span></li>)}</ul></section>}
    <footer className="mt-10 border-t pt-4 text-xs text-slate-500"><p>All amounts in Indian rupees (INR). Thank you for your business.</p>{invoice.sentAt && <p className="mt-1">Emailed to the customer on {dateTime(invoice.sentAt)}.</p>}</footer>
  </article>;
}
