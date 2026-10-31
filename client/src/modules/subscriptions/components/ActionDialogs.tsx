import { useState, type ReactNode } from 'react';
import type { Subscription, SubscriptionStatus } from '../../../types/api';
import { ErrorNotice, fieldErrors } from '../../../components/ops/errors';
import { addDays, date, today } from '../../../components/ops/format';
import { LinesEditor, toLineInputs, type EditableLine } from '../../../components/ops/pickers';
import { Button, Field, inputClass, Modal, Notice } from '../../../components/ops/ui';
import { useChangeLines, useDeleteSubscription, useScheduleCancellation, useTransition, useUnscheduleCancellation } from '../api';
import { toEditableLines } from './SubscriptionForm';

export type Dialog = { kind: 'transition'; to: SubscriptionStatus } | { kind: 'cancel' } | { kind: 'withdraw' } | { kind: 'lines' } | { kind: 'delete' };

/** Friendly button label for moving to a status, from the current status. */
export function transitionLabel(from: SubscriptionStatus, to: SubscriptionStatus): string {
  if (to === 'ACTIVE' && from === 'PAUSED') return 'Resume';
  if (to === 'ACTIVE' && from === 'CLOSED') return 'Renew';
  return ({ QUOTATION: 'Send quotation', CONFIRMED: 'Confirm', ACTIVE: 'Activate', PAUSED: 'Pause', CLOSED: 'Close', DRAFT: 'Back to draft' } as const)[to];
}

const BILLING_NOTE = 'Billing is due for this subscription. The periods that are already due will be invoiced first, then this action proceeds.';

function explain(sub: Subscription, to: SubscriptionStatus): string {
  switch (to) {
    case 'QUOTATION': return 'The subscription moves to Quotation so it can be reviewed with the customer.';
    case 'CONFIRMED': return 'The customer has agreed. The subscription is confirmed and can then be activated.';
    case 'ACTIVE': return sub.status === 'PAUSED' ? 'Billing resumes for this subscription.' : sub.status === 'CLOSED' ? 'The subscription is reopened and billing starts again.' : 'The subscription becomes active and starts billing.';
    case 'PAUSED': return 'Billing is paused until the subscription is resumed.';
    case 'CLOSED': return 'The subscription is closed and stops billing. Invoices already issued are not changed.';
    default: return 'The subscription status will change.';
  }
}

function Reason({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string[] }) {
  return <Field label="Reason (optional)" error={error}>{f => <textarea {...f} rows={2} className={inputClass} value={value} onChange={e => onChange(e.target.value)} />}</Field>;
}

function Shell({ title, onClose, confirm, children, tone = 'primary', busy, error, onSubmit, disabled }: { title: string; onClose: () => void; confirm: string; children: ReactNode; tone?: 'primary' | 'danger'; busy: boolean; error: unknown; onSubmit: () => void; disabled?: boolean }) {
  return <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={tone} busy={busy} disabled={disabled} onClick={onSubmit}>{confirm}</Button></>}>
    <div className="space-y-4">{children}<ErrorNotice error={error} /></div>
  </Modal>;
}

function TransitionDialog({ sub, to, onClose }: { sub: Subscription; to: SubscriptionStatus; onClose: () => void }) {
  const mutation = useTransition(sub.id);
  const [reason, setReason] = useState('');
  const [renewal, setRenewal] = useState(addDays(today(), 365));
  const renewing = sub.status === 'CLOSED' && to === 'ACTIVE';
  const warnsBilling = sub.billingDue && (to === 'PAUSED' || to === 'CLOSED');
  const errors = fieldErrors(mutation.error);
  const submit = () => mutation.mutate({ to, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(renewing ? { renewalExpiryDate: renewal } : {}) }, { onSuccess: onClose });
  const name = transitionLabel(sub.status, to);
  return <Shell title={`${name} ${sub.number}`} onClose={onClose} confirm={name} tone={to === 'CLOSED' ? 'danger' : 'primary'} busy={mutation.isPending} error={mutation.error} onSubmit={submit}>
    <p className="text-sm text-slate-700">{explain(sub, to)}</p>
    {warnsBilling && <Notice tone="warning">{BILLING_NOTE}</Notice>}
    {renewing && <Field label="New end date" error={errors.renewalExpiryDate} hint="Must be later than today.">{f => <input {...f} type="date" min={addDays(today(), 1)} className={inputClass} value={renewal} onChange={e => setRenewal(e.target.value)} />}</Field>}
    <Reason value={reason} onChange={setReason} error={errors.reason} />
  </Shell>;
}

function CancelDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const mutation = useScheduleCancellation(sub.id);
  const [reason, setReason] = useState('');
  return <Shell title="Cancel at period end" onClose={onClose} confirm="Schedule the end" tone="danger" busy={mutation.isPending} error={mutation.error} onSubmit={() => mutation.mutate(reason.trim() ? { reason: reason.trim() } : {}, { onSuccess: onClose })}>
    <p className="text-sm text-slate-700">The service continues until the end of the period that is already invoiced, and nothing further is billed. You can still withdraw this before that date.</p>
    {sub.billingDue && <Notice tone="warning">{BILLING_NOTE}</Notice>}
    <Reason value={reason} onChange={setReason} error={fieldErrors(mutation.error).reason} />
  </Shell>;
}

function WithdrawDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const mutation = useUnscheduleCancellation(sub.id);
  const [reason, setReason] = useState('');
  return <Shell title="Keep subscription" onClose={onClose} confirm="Keep subscription" busy={mutation.isPending} error={mutation.error} onSubmit={() => mutation.mutate(reason.trim() ? { reason: reason.trim() } : {}, { onSuccess: onClose })}>
    <p className="text-sm text-slate-700">The scheduled end{sub.expiryDate ? ` on ${date(sub.expiryDate)}` : ''} is withdrawn and the subscription continues to renew and bill.</p>
    <Reason value={reason} onChange={setReason} error={fieldErrors(mutation.error).reason} />
  </Shell>;
}

function LinesDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const mutation = useChangeLines(sub.id);
  const [lines, setLines] = useState<EditableLine[]>(() => toEditableLines(sub));
  const [reason, setReason] = useState('');
  const errors = fieldErrors(mutation.error);
  return <Modal wide title="Change seats / products" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={mutation.isPending} onClick={() => mutation.mutate({ lines: toLineInputs(lines), ...(reason.trim() ? { reason: reason.trim() } : {}) }, { onSuccess: onClose })}>Apply from next invoice</Button></>}>
    <div className="space-y-4">
      <Notice tone="info">Changes apply from the next invoice only, with no proration. Invoices already issued never change.</Notice>
      {sub.billingDue && <Notice tone="warning">{BILLING_NOTE}</Notice>}
      <LinesEditor lines={lines} onChange={setLines} errors={errors} />
      <Reason value={reason} onChange={setReason} error={errors.reason} />
      <ErrorNotice error={mutation.error} />
    </div>
  </Modal>;
}

function DeleteDialog({ sub, onClose, onDeleted }: { sub: Subscription; onClose: () => void; onDeleted: () => void }) {
  const mutation = useDeleteSubscription(sub.id);
  return <Shell title={`Delete ${sub.number}`} onClose={onClose} confirm="Delete subscription" tone="danger" busy={mutation.isPending} error={mutation.error} onSubmit={() => mutation.mutate(undefined, { onSuccess: onDeleted })}>
    <p className="text-sm text-slate-700">This permanently deletes the draft subscription. This cannot be undone.</p>
  </Shell>;
}

export function ActionDialogs({ sub, dialog, onClose, onDeleted }: { sub: Subscription; dialog: Dialog | null; onClose: () => void; onDeleted: () => void }) {
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'transition': return <TransitionDialog sub={sub} to={dialog.to} onClose={onClose} />;
    case 'cancel': return <CancelDialog sub={sub} onClose={onClose} />;
    case 'withdraw': return <WithdrawDialog sub={sub} onClose={onClose} />;
    case 'lines': return <LinesDialog sub={sub} onClose={onClose} />;
    case 'delete': return <DeleteDialog sub={sub} onClose={onClose} onDeleted={onDeleted} />;
  }
}
