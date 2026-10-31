import { Link } from 'react-router-dom';
import { Button, Card, DataTable, Notice, type Column } from '../../../components/ops/ui';
import type { BillingResult } from '../../../types/api';

type Failure = BillingResult['failures'][number];

const failureColumns: Column<Failure>[] = [
  { header: 'Subscription', cell: f => <Link className="font-mono text-xs text-brand-700 hover:underline" to={`/subscriptions/${f.subscriptionId}`}>{f.subscriptionId}</Link> },
  { header: 'Reason', cell: f => f.message },
];

/** Outcome of a billing run. Every number is the server's. */
export function BillingResultCard({ result, busy, onRunAgain }: { result: BillingResult; busy: boolean; onRunAgain: () => void }) {
  const stats: Array<[string, number, string]> = [
    ['Invoices created', result.created, 'Draft invoices'],
    ['Skipped', result.skipped, 'Nothing to bill'],
    ['Failed', result.failed, 'Subscriptions with errors'],
    ['Auto-closed', result.autoClosed, 'Expired subscriptions'],
  ];
  return <Card title="Billing result" actions={<Link to="/invoices?status=DRAFT" className="text-sm font-medium text-brand-700 hover:underline">Review draft invoices</Link>}>
    <div className="space-y-5">
      {result.hasMore && <Notice tone="warning" title="More subscriptions are waiting">
        <p>This run did not cover everything that is due. Run billing again to continue; periods that were already billed are never billed twice.</p>
        <div className="mt-3"><Button variant="primary" busy={busy} onClick={onRunAgain}>Run again</Button></div>
      </Notice>}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">{stats.map(([name, value, hint]) => <div key={name} className="rounded-lg border bg-slate-50 p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{name}</dt><dd className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString('en-IN')}</dd><p className="text-xs text-slate-500">{hint}</p></div>)}</dl>
      {result.created === 0 && result.failed === 0 && !result.hasMore && <p className="text-sm text-slate-600">No subscription had an invoice due up to that date, so nothing was created.</p>}
      {result.failures.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-rose-700">Failures</h3><DataTable caption="Subscriptions that failed to bill" columns={failureColumns} rows={result.failures} rowKey={f => f.subscriptionId} empty="No failures." /></div>}
    </div>
  </Card>;
}
