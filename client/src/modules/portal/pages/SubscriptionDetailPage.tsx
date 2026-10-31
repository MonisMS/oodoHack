import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button, Card, Facts, Notice, StatusBadge } from '../../../components/ops/ui';
import { SubscriptionCharges } from '../../../components/ops/SubscriptionCharges';
import { BILLING_PERIOD_LABEL, date, dateTime, money } from '../../../components/ops/format';
import { usePortalSubscription } from '../api';
import { BackLink, QueryState } from '../components/Shared';
import { CancelModal, KeepModal } from '../components/CancellationModals';


export default function SubscriptionDetailPage() {
  const { id = '' } = useParams();
  const query = usePortalSubscription(id);
  const [dialog, setDialog] = useState<'cancel' | 'keep' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const sub = query.data;
  const done = (text: string) => { setDialog(null); setMessage(text); };

  return <div className="space-y-6">
    <BackLink to="/portal/subscriptions">All subscriptions</BackLink>
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => void query.refetch()} />
    {sub && <>
      <PageHeader title={`Subscription ${sub.number}`} description={sub.planName} actions={<div className="flex flex-wrap gap-2">
        {sub.canScheduleCancellation && <Button variant="danger" onClick={() => setDialog('cancel')}>Cancel at period end</Button>}
        {sub.canWithdrawCancellation && <Button variant="primary" onClick={() => setDialog('keep')}>Keep my subscription</Button>}</div>} />
      {message && <Notice tone="success" onDismiss={() => setMessage(null)}>{message}</Notice>}
      {sub.cancelAtPeriodEnd && <Notice tone="warning" title={`Your subscription ends on ${date(sub.expiryDate)}.`}>You keep full access until then.</Notice>}
      <Card><Facts items={[
        ['Status', <StatusBadge key="s" status={sub.status} />], ['Plan', sub.planName],
        ['Billing period', BILLING_PERIOD_LABEL[sub.planBillingPeriod] ? `Every ${BILLING_PERIOD_LABEL[sub.planBillingPeriod]}` : sub.planBillingPeriod],
        ['Plan fee', money(sub.planPrice)], ['Started', date(sub.startDate)],
        [sub.cancelAtPeriodEnd ? 'Last day of service' : 'Next invoice', sub.cancelAtPeriodEnd ? date(sub.expiryDate) : date(sub.nextInvoiceDate)],
        ['Payment terms', `${sub.paymentTermsDays} days`],
      ]} /></Card>
      <Card title="What is included"><SubscriptionCharges sub={sub} /></Card>
      <Card title="History">
        {sub.history.length === 0 ? <p className="text-sm text-slate-500">No changes yet.</p> : <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
          {sub.history.map(h => <li key={h.id} className="text-sm"><span className="flex flex-wrap items-center gap-2"><StatusBadge status={h.fromStatus} /><span aria-hidden="true">→</span><span className="sr-only">changed to</span><StatusBadge status={h.toStatus} /></span><span className="mt-1 block text-xs text-slate-500">{dateTime(h.createdAt)}</span></li>)}</ol>}
      </Card>
      {dialog === 'cancel' && <CancelModal subscription={sub} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'keep' && <KeepModal subscription={sub} onClose={() => setDialog(null)} onDone={done} />}
    </>}
  </div>;
}
