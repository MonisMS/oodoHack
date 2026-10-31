import { useState } from 'react';
import { ErrorNotice } from '../../../components/ops/errors';
import { Button, Notice } from '../../../components/ops/ui';
import type { Id } from '../../../types/api';
import { useBulkAction, type BulkAction } from '../api';
import { ConfirmDialog } from './ConfirmDialog';

export const BULK_LIMIT = 100;

const COPY: Record<BulkAction, { button: string; title: string; verb: string; effect: string }> = {
  confirm: { button: 'Confirm selected', title: 'Confirm selected invoices?', verb: 'confirmed', effect: 'will be confirmed (draft invoices only; others are reported as failures)' },
  send: { button: 'Send selected', title: 'Email selected invoices?', verb: 'emailed', effect: 'will each be emailed to their customer. Emails cannot be recalled' },
  remind: { button: 'Remind selected', title: 'Send payment reminders?', verb: 'reminded', effect: 'will each get a payment reminder email (overdue invoices only, at most once per 24 hours; others are reported as failures)' },
};

interface Outcome { action: BulkAction; succeeded: number; failures: Array<{ id: Id; label: string; message: string }> }

/** Bulk action bar over the selected rows. `selected` maps invoice id to invoice number so failures can be named. */
export function BulkActions({ selected, onClear }: { selected: Map<Id, string>; onClear: () => void }) {
  const mutation = useBulkAction();
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const count = selected.size;
  const tooMany = count > BULK_LIMIT;

  const run = (action: BulkAction) => {
    const names = new Map(selected);
    mutation.mutate({ action, ids: [...names.keys()] }, {
      onSuccess: result => {
        setPending(null); onClear();
        setOutcome({ action, succeeded: result.succeeded, failures: result.failed.map(f => ({ id: f.id, label: names.get(f.id) ?? f.id, message: f.message })) });
      },
    });
  };
  const ask = (action: BulkAction) => { mutation.reset(); setOutcome(null); setPending(action); };

  return <div className="space-y-3">
    {count > 0 && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3" role="region" aria-label="Bulk actions">
      <span className="mr-2 text-sm font-medium">{count} selected</span>
      {(Object.keys(COPY) as BulkAction[]).map(action => <Button key={action} disabled={tooMany} onClick={() => ask(action)}>{COPY[action].button}</Button>)}
      <Button variant="ghost" onClick={onClear}>Clear selection</Button>
      {tooMany && <span className="text-sm text-rose-700">Select at most {BULK_LIMIT} invoices for one bulk action.</span>}
    </div>}
    {outcome && <Notice tone={outcome.failures.length ? 'warning' : 'success'} title={`${outcome.succeeded} invoice${outcome.succeeded === 1 ? '' : 's'} ${COPY[outcome.action].verb}${outcome.failures.length ? `, ${outcome.failures.length} failed` : ''}`} onDismiss={() => setOutcome(null)}>
      {outcome.failures.length > 0 && <ul className="list-disc pl-5">{outcome.failures.map(f => <li key={f.id}><span className="font-medium">{f.label}</span>: {f.message}</li>)}</ul>}
    </Notice>}
    {!pending && <ErrorNotice error={mutation.error} />}
    {pending && <ConfirmDialog title={COPY[pending].title} confirmLabel={COPY[pending].button} busy={mutation.isPending} error={mutation.error} onConfirm={() => run(pending)} onClose={() => setPending(null)}>
      {count} invoice{count === 1 ? '' : 's'} {COPY[pending].effect}. Each invoice is processed independently, so one failure does not stop the others.
    </ConfirmDialog>}
  </div>;
}
