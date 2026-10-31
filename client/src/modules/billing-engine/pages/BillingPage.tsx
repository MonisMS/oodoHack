import { useState, type FormEvent } from 'react';
import { ErrorNotice, fieldErrors } from '../../../components/ops/errors';
import { date, today } from '../../../components/ops/format';
import { Button, Card, Field, inputClass, Modal } from '../../../components/ops/ui';
import { PageHeader } from '../../../components/ui/PageHeader';
import type { BillingInput } from '../../../types/api';
import { useRunBilling } from '../api';
import { BillingResultCard } from '../components/BillingResultCard';

export default function BillingPage() {
  const mutation = useRunBilling();
  const [asOfDate, setAsOfDate] = useState(today());
  const [maxPeriods, setMaxPeriods] = useState('24');
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<BillingInput | null>(null);
  const serverFields = fieldErrors(mutation.error);

  const review = (event: FormEvent) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!asOfDate) errors.asOfDate = 'Choose the date to bill up to.';
    const periods = Number(maxPeriods);
    if (!/^\d+$/.test(maxPeriods.trim()) || periods < 1 || periods > 120) errors.maxPeriods = 'Enter a whole number from 1 to 120.';
    setLocalErrors(errors);
    if (Object.keys(errors).length) return;
    mutation.reset();
    setConfirming({ asOfDate, maxPeriodsPerSubscription: periods });
  };
  const run = (input: BillingInput) => mutation.mutate(input, { onSettled: () => setConfirming(null) });

  return <>
    <PageHeader title="Run billing" description="Create draft invoices for subscriptions that are due." />
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card title="What billing does">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Creates a draft invoice for every active subscription whose next invoice date has arrived, one per due period.</li>
            <li>Safe to repeat: a period is never billed twice.</li>
            <li>Subscriptions that have expired are closed automatically.</li>
            <li>Drafts can be reviewed on the invoices page before they are confirmed and sent.</li>
          </ul>
        </Card>
        <Card title="Billing run">
          <form onSubmit={review} noValidate className="space-y-4">
            <Field label="Bill up to" hint="Subscriptions due on or before this date are billed. It cannot be in the future." error={localErrors.asOfDate ?? serverFields.asOfDate}>{f => <input {...f} type="date" className={inputClass} value={asOfDate} max={today()} onChange={e => setAsOfDate(e.target.value)} />}</Field>
            <details className="rounded-lg border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Advanced</summary>
              <div className="mt-3"><Field label="Max periods per subscription" hint="Caps how many overdue periods one subscription can catch up in a single run (1 to 120)." error={localErrors.maxPeriods ?? serverFields.maxPeriodsPerSubscription}>{f => <input {...f} className={inputClass} inputMode="numeric" value={maxPeriods} onChange={e => setMaxPeriods(e.target.value)} />}</Field></div>
            </details>
            {!confirming && <ErrorNotice error={mutation.error} />}
            <Button type="submit" variant="primary" busy={mutation.isPending}>Run billing</Button>
          </form>
        </Card>
      </div>
      <div>{mutation.data && <BillingResultCard result={mutation.data} busy={mutation.isPending} onRunAgain={() => run({ asOfDate, maxPeriodsPerSubscription: Number(maxPeriods) })} />}</div>
    </div>
    {confirming && <Modal title="Run billing now?" onClose={() => setConfirming(null)}
      footer={<><Button onClick={() => setConfirming(null)}>Cancel</Button><Button variant="primary" busy={mutation.isPending} onClick={() => run(confirming)}>Run billing</Button></>}>
      <p className="text-sm text-slate-700">Draft invoices will be created for every active subscription due on or before <span className="font-medium">{date(confirming.asOfDate)}</span>, up to {confirming.maxPeriodsPerSubscription} periods each, and expired subscriptions will be closed. Periods already billed are skipped.</p>
    </Modal>}
  </>;
}
