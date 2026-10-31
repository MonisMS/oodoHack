import { useState, type FormEvent } from 'react';
import { Button, Field, Modal, inputClass } from '../../../components/ops/ui';
import { ErrorNotice } from '../../../components/ops/errors';
import { date } from '../../../components/ops/format';
import type { PortalSubscription } from '../../../types/api';
import { useCancellationChange } from '../api';

export function CancelModal({ subscription, onClose, onDone }: { subscription: PortalSubscription; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const cancel = useCancellationChange(subscription.id, 'cancel-at-period-end');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    cancel.mutate(reason.trim() ? { reason: reason.trim() } : {}, { onSuccess: () => onDone('Your cancellation is scheduled. You keep full access until the end of the period you have already paid for.') });
  };
  return <Modal title="Cancel at period end" onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm">Your subscription <strong>{subscription.number}</strong> will keep working until the end of the period you have already paid for, and nothing further will be billed. You can change your mind with &ldquo;Keep my subscription&rdquo; until then.</p>
      <Field label="Reason (optional)" hint="Tell us why you are leaving; it helps us improve.">
        {p => <textarea {...p} rows={3} maxLength={500} className={inputClass} value={reason} onChange={e => setReason(e.target.value)} />}
      </Field>
      {cancel.error && <ErrorNotice error={cancel.error} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onClose}>Go back</Button>
        <Button type="submit" variant="danger" busy={cancel.isPending}>Cancel at period end</Button>
      </div>
    </form>
  </Modal>;
}

export function KeepModal({ subscription, onClose, onDone }: { subscription: PortalSubscription; onClose: () => void; onDone: (message: string) => void }) {
  const keep = useCancellationChange(subscription.id, 'keep');
  return <Modal title="Keep my subscription" onClose={onClose} footer={<>
    <Button onClick={onClose}>Go back</Button>
    <Button variant="primary" busy={keep.isPending} onClick={() => keep.mutate({}, { onSuccess: () => onDone('Great, your subscription will continue as normal.') })}>Keep my subscription</Button></>}>
    <p className="text-sm">Your subscription is set to end on {date(subscription.expiryDate)}. Keeping it removes the scheduled end and billing continues as normal.</p>
    {keep.error && <div className="mt-3"><ErrorNotice error={keep.error} /></div>}
  </Modal>;
}
