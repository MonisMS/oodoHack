import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorNotice } from '../../../components/ops/errors';
import { Button, Notice } from '../../../components/ops/ui';
import type { Invoice, Payment } from '../../../types/api';
import { RecordPaymentDialog } from '../../payments/components/RecordPaymentDialog';
import { useInvoiceAction, type InvoiceAction } from '../api';
import { ConfirmDialog } from './ConfirmDialog';

type Confirmable = 'cancel' | 'send' | 'remind';

const COPY: Record<Confirmable, { title: string; confirm: string; danger?: boolean; body: (i: Invoice) => string }> = {
  cancel: { title: 'Cancel this invoice?', confirm: 'Cancel invoice', danger: true, body: i => `Invoice ${i.number} will be cancelled and can no longer be paid. A cancelled invoice with no payments can be reopened as a draft later.` },
  send: { title: 'Email this invoice?', confirm: 'Send email', body: i => `An email with invoice ${i.number} will be sent to ${i.customerName} at ${i.customerEmail}. This cannot be undone.` },
  remind: { title: 'Send a payment reminder?', confirm: 'Send reminder', body: i => `A payment reminder for overdue invoice ${i.number} will be emailed to ${i.customerName} at ${i.customerEmail}. Reminders can be sent at most once every 24 hours.` },
};

/** The action bar. Which buttons appear is decided purely by the invoice fields the server returns; the server still validates each action. */
export function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const mutation = useInvoiceAction(invoice.id);
  const [confirming, setConfirming] = useState<Confirmable | null>(null);
  const [paying, setPaying] = useState(false);
  const [recorded, setRecorded] = useState<Payment | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const hasPayments = invoice.payments.length > 0;
  const canPay = invoice.status === 'CONFIRMED' || invoice.status === 'PARTIALLY_PAID';
  const canSend = canPay || invoice.status === 'PAID';
  const canCancel = invoice.status === 'DRAFT' || (invoice.status === 'CONFIRMED' && !hasPayments);

  const run = (action: InvoiceAction, message: string) => mutation.mutate(action, { onSuccess: () => { setConfirming(null); setDone(message); } });
  const open = (action: Confirmable) => { mutation.reset(); setDone(null); setConfirming(action); };
  const direct = (action: InvoiceAction, message: string) => { setDone(null); setRecorded(null); run(action, message); };
  const confirmMessage: Record<Confirmable, string> = { cancel: 'Invoice cancelled.', send: 'Invoice emailed to the customer.', remind: 'Payment reminder sent.' };

  return <div className="no-print space-y-3">
    <div className="flex flex-wrap gap-2">
      {invoice.status === 'DRAFT' && <Button variant="primary" busy={mutation.isPending && mutation.variables === 'confirm'} onClick={() => direct('confirm', 'Invoice confirmed.')}>Confirm invoice</Button>}
      {canPay && <Button variant="primary" onClick={() => { mutation.reset(); setDone(null); setRecorded(null); setPaying(true); }}>Record payment</Button>}
      {canSend && <Button onClick={() => open('send')}>Send email</Button>}
      {invoice.overdue && <Button onClick={() => open('remind')}>Send reminder</Button>}
      {invoice.status === 'CANCELLED' && !hasPayments && <Button busy={mutation.isPending && mutation.variables === 'reopen'} onClick={() => direct('reopen', 'Invoice reopened as a draft.')}>Reopen as draft</Button>}
      {canCancel && <Button variant="danger" onClick={() => open('cancel')}>Cancel invoice</Button>}
      <Link to={`/invoices/${invoice.id}/print`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">Print</Link>
    </div>
    {done && <Notice tone="success" onDismiss={() => setDone(null)}>{done}</Notice>}
    {recorded && <Notice tone="success" onDismiss={() => setRecorded(null)}>Payment recorded.</Notice>}
    {!confirming && !paying && <ErrorNotice error={mutation.error} />}
    {confirming && <ConfirmDialog title={COPY[confirming].title} confirmLabel={COPY[confirming].confirm} danger={COPY[confirming].danger} busy={mutation.isPending} error={mutation.error}
      onConfirm={() => run(confirming, confirmMessage[confirming])} onClose={() => setConfirming(null)}>{COPY[confirming].body(invoice)}</ConfirmDialog>}
    {paying && <RecordPaymentDialog invoice={invoice} onClose={() => setPaying(false)} onRecorded={payment => { setPaying(false); setRecorded(payment); }} />}
  </div>;
}
