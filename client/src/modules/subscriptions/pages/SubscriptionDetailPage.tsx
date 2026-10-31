import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ErrorNotice } from '../../../components/ops/errors';
import { date, label, money } from '../../../components/ops/format';
import { BILLING_PERIOD_LABEL } from '../../../components/ops/format';
import { Button, Card, DataTable, Facts, Notice, Spinner, StatusBadge } from '../../../components/ops/ui';
import { useSubscription } from '../api';
import { ActionDialogs, transitionLabel, type Dialog } from '../components/ActionDialogs';
import { Timeline } from '../components/Timeline';

export default function SubscriptionDetailPage() {
  const { id = '' } = useParams(); const navigate = useNavigate();
  const { data: sub, isLoading, error, refetch } = useSubscription(id);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  if (isLoading) return <div className="flex justify-center p-10"><Spinner /></div>;
  if (error || !sub) return <div className="space-y-3"><ErrorNotice error={error} title="The subscription could not be loaded" /><Button onClick={() => void refetch()}>Try again</Button></div>;

  const runningOrPaused = sub.status === 'ACTIVE' || sub.status === 'PAUSED';
  const editable = sub.status === 'DRAFT' || sub.status === 'QUOTATION';
  const changeable = sub.status === 'CONFIRMED' || runningOrPaused;
  return <>
    <PageHeader title={sub.number} description={`${sub.customerName} · ${sub.customerEmail}`} actions={<div className="flex items-center gap-2"><StatusBadge status={sub.status} />{sub.cancelAtPeriodEnd && <StatusBadge status="ENDS_AT_PERIOD_END" tone="red" />}</div>} />
    <div className="space-y-5">
      {sub.billingDue && <Notice tone="warning" title="Billing is due">Pausing, closing, scheduling the end or changing lines will first invoice the periods that are already due. <Link className="underline" to={`/invoices?customerId=${sub.customerId}`}>View invoices</Link></Notice>}
      {sub.cancelAtPeriodEnd && <Notice tone="info" title="This subscription ends at the end of the current period">Service continues until {date(sub.expiryDate)} and nothing further is billed.</Notice>}
      <Card title="Actions"><div className="flex flex-wrap gap-2">
        {sub.allowedTransitions.map(to => <Button key={to} variant={to === 'CLOSED' ? 'danger' : 'primary'} onClick={() => setDialog({ kind: 'transition', to })}>{transitionLabel(sub.status, to)}</Button>)}
        {runningOrPaused && !sub.cancelAtPeriodEnd && <Button onClick={() => setDialog({ kind: 'cancel' })}>Cancel at period end</Button>}
        {runningOrPaused && sub.cancelAtPeriodEnd && <Button onClick={() => setDialog({ kind: 'withdraw' })}>Keep subscription</Button>}
        {changeable && <Button onClick={() => setDialog({ kind: 'lines' })}>Change seats / products</Button>}
        {editable && <Button onClick={() => navigate(`/subscriptions/${sub.id}/edit`)}>Edit</Button>}
        {sub.status === 'DRAFT' && <Button variant="danger" onClick={() => setDialog({ kind: 'delete' })}>Delete</Button>}
        <Link to={`/invoices?customerId=${sub.customerId}`} className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">View invoices</Link>
      </div></Card>
      <Card title="Details"><Facts items={[
        ['Plan', `${sub.planName} (billed ${label(sub.planBillingPeriod).toLowerCase()})`],
        ['Plan fee', sub.planPrice ? `${money(sub.planPrice)} / ${BILLING_PERIOD_LABEL[sub.planBillingPeriod]}` : '—'],
        ['Start date', date(sub.startDate)],
        [sub.cancelAtPeriodEnd ? 'Ends' : 'Expiry date', date(sub.expiryDate)],
        ['Next invoice', date(sub.nextInvoiceDate)],
        ['Payment terms', `${sub.paymentTermsDays} days`],
        ['Template', sub.templateId ? <Link key="t" className="text-brand-700 hover:underline" to={`/quotation-templates/${sub.templateId}`}>View template</Link> : '—'],
        ['Notes', sub.notes ?? '—'],
      ]} /></Card>
      <Card title="Lines"><DataTable caption="Subscription lines" rows={sub.lines} rowKey={l => l.id} empty="This subscription has no lines."
        columns={[
          { header: 'Description', cell: l => l.description },
          { header: 'Quantity', align: 'right', cell: l => l.quantity },
          { header: 'Unit price', align: 'right', cell: l => money(l.unitPrice) },
        ]} /></Card>
      <Card title="History"><Timeline events={sub.history} /></Card>
      <p className="text-sm"><Link to="/subscriptions" className="text-brand-700 hover:underline">Back to subscriptions</Link></p>
    </div>
    <ActionDialogs sub={sub} dialog={dialog} onClose={() => setDialog(null)} onDeleted={() => navigate('/subscriptions')} />
  </>;
}
