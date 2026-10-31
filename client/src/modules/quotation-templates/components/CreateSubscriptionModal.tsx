import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuotationTemplate } from '../../../types/api';
import { ErrorNotice, fieldErrors } from '../../../components/ops/errors';
import { today } from '../../../components/ops/format';
import { CustomerSelect } from '../../../components/ops/pickers';
import { Button, Field, inputClass, Modal } from '../../../components/ops/ui';
import { useCreateFromTemplate } from '../api';

export function CreateSubscriptionModal({ template, onClose }: { template: QuotationTemplate; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateFromTemplate();
  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [terms, setTerms] = useState('15');
  const [notes, setNotes] = useState('');
  const errors = fieldErrors(create.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ templateId: template.id, customerId, startDate, paymentTermsDays: Number(terms), ...(notes.trim() ? { notes: notes.trim() } : {}) }, { onSuccess: s => navigate(`/subscriptions/${s.id}`) });
  };
  return <Modal title={`Create subscription from "${template.name}"`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" form="from-template-form" variant="primary" busy={create.isPending}>Create subscription</Button></>}>
    <form id="from-template-form" onSubmit={submit} className="space-y-4" noValidate>
      <CustomerSelect value={customerId} onChange={setCustomerId} error={errors.customerId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" error={errors.startDate}>{f => <input {...f} type="date" className={inputClass} value={startDate} onChange={e => setStartDate(e.target.value)} />}</Field>
        <Field label="Payment terms (days)" error={errors.paymentTermsDays}>{f => <input {...f} type="number" min={0} step={1} className={inputClass} value={terms} onChange={e => setTerms(e.target.value)} />}</Field>
      </div>
      <Field label="Notes (optional)" error={errors.notes}>{f => <textarea {...f} rows={3} className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} />}</Field>
      <ErrorNotice error={create.error} />
    </form>
  </Modal>;
}
