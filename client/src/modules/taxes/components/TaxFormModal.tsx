import { useState, type FormEvent } from 'react';
import { Button, Field, inputClass, Modal } from '../../../components/ops/ui';
import { ErrorNotice, fieldErrors } from '../../../components/ops/errors';
import type { Tax } from '../../../types/api';
import { useSaveTax } from '../api';

export function TaxFormModal({ tax, onClose, onSaved }: { tax: Tax | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(tax?.name ?? '');
  const [percentage, setPercentage] = useState(tax ? String(Number(tax.percentage)) : '');
  const [isActive, setIsActive] = useState(tax?.isActive ?? true);
  const save = useSaveTax();
  const fields = fieldErrors(save.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Existing links are sent back unchanged so editing never silently unlinks products or plans.
    save.mutate(
      { id: tax?.id, input: { name: name.trim(), percentage: percentage.trim(), isActive, productIds: tax?.productIds ?? [], planIds: tax?.planIds ?? [] } },
      { onSuccess: () => onSaved(tax ? `Tax "${name.trim()}" was updated.` : `Tax "${name.trim()}" was created.`) },
    );
  };

  return <Modal title={tax ? 'Edit tax' : 'New tax'} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4" noValidate>
      {save.error && <ErrorNotice error={save.error} />}
      <Field label="Name" error={fields.name} hint="Shown on invoices, for example GST.">
        {p => <input {...p} className={inputClass} value={name} maxLength={100} required onChange={e => setName(e.target.value)} />}
      </Field>
      <Field label="Percentage (%)" error={fields.percentage} hint="0 to 100, up to 4 decimals.">
        {p => <input {...p} className={inputClass} inputMode="decimal" value={percentage} required placeholder="18" onChange={e => setPercentage(e.target.value)} />}
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active (applied to future invoices)</label>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" busy={save.isPending}>{tax ? 'Save changes' : 'Create tax'}</Button>
      </div>
    </form>
  </Modal>;
}
