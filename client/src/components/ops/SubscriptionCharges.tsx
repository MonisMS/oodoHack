import type { Subscription } from '../../types/api';
import { money } from './format';
import { DataTable } from './ui';

interface Row { id: string; description: string; quantity: number; unitPrice: string; taxNames: string; taxTotal: string | null; total: string | null }

/**
 * The lines of a subscription with the tax and amount each one is billed with, the plan fee, and what one billing period costs
 * in total. Every figure is calculated by the server (the same calculator that produces the invoice), before any discount:
 * discounts are decided when the invoice is created.
 */
export function SubscriptionCharges({ sub }: { sub: Pick<Subscription, 'lines' | 'planFee' | 'estimate'> }) {
  const rows: Row[] = [
    ...(sub.planFee ? [{ id: 'plan-fee', description: `Plan fee: ${sub.planFee.description}`, quantity: sub.planFee.quantity, unitPrice: sub.planFee.unitPrice, taxNames: sub.planFee.taxes.map(t => `${t.name} ${t.percentage}%`).join(', '), taxTotal: sub.planFee.taxTotal, total: sub.planFee.total }] : []),
    ...sub.lines.map(l => ({ id: l.id, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxNames: l.taxes.map(t => `${t.name} ${t.percentage}%`).join(', '), taxTotal: l.taxTotal, total: l.total })),
  ];
  return <div className="space-y-4">
    <DataTable caption="Subscription lines with tax and amount" rows={rows} rowKey={r => r.id} empty="This subscription has no lines."
      columns={[
        { header: 'Description', cell: r => <span>{r.description}{r.taxNames && <span className="block text-xs text-slate-500">{r.taxNames}</span>}</span> },
        { header: 'Quantity', align: 'right', cell: r => r.quantity },
        { header: 'Unit price', align: 'right', cell: r => money(r.unitPrice) },
        { header: 'Tax', align: 'right', cell: r => money(r.taxTotal) },
        { header: 'Amount', align: 'right', cell: r => money(r.total) },
      ]} />
    {sub.estimate && <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Each billing period, before discounts</p>
      <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{money(sub.estimate.subtotal)}</dd></div>
      <div className="flex justify-between"><dt className="text-slate-500">Tax</dt><dd className="tabular-nums">{money(sub.estimate.taxTotal)}</dd></div>
      <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(sub.estimate.total)}</dd></div>
    </dl>}
  </div>;
}
