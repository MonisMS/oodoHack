import { Input as LibraryInput } from "../../../components/ui/primitives/input";
import { Textarea as LibraryTextarea } from "../../../components/ui/primitives/textarea";
import { useState, type FormEvent } from "react";
import type { Subscription, SubscriptionInput } from "../../../types/api";
import { ErrorNotice, fieldErrors } from "../../../components/ops/errors";
import { today } from "../../../components/ops/format";
import {
  CustomerSelect,
  LinesEditor,
  PlanSelect,
  blankLine,
  toLineInputs,
  type EditableLine,
} from "../../../components/ops/pickers";
import { Button, Card, Field, inputClass } from "../../../components/ops/ui";

export const toEditableLines = (subscription?: Subscription): EditableLine[] =>
  subscription?.lines.length
    ? subscription.lines.map((l) => ({
        key: l.id,
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }))
    : [blankLine()];

export function SubscriptionForm({
  subscription,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  subscription?: Subscription;
  saving: boolean;
  error: unknown;
  onSubmit: (input: SubscriptionInput) => void;
  onCancel: () => void;
}) {
  const [customerId, setCustomerId] = useState(subscription?.customerId ?? "");
  const [planId, setPlanId] = useState(subscription?.planId ?? "");
  const [startDate, setStartDate] = useState(
    subscription?.startDate ?? today(),
  );
  const [expiryDate, setExpiryDate] = useState(subscription?.expiryDate ?? "");
  const [terms, setTerms] = useState(
    String(subscription?.paymentTermsDays ?? 15),
  );
  const [notes, setNotes] = useState(subscription?.notes ?? "");
  const [lines, setLines] = useState<EditableLine[]>(() =>
    toEditableLines(subscription),
  );
  const errors = fieldErrors(error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      customerId,
      planId,
      startDate,
      expiryDate: expiryDate || null,
      paymentTermsDays: Number(terms),
      notes: notes.trim() || null,
      lines: toLineInputs(lines),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card title="Subscription">
        <div className="grid gap-4 md:grid-cols-2">
          <CustomerSelect
            value={customerId}
            onChange={setCustomerId}
            error={errors.customerId}
          />
          <PlanSelect
            value={planId}
            onChange={(id) => setPlanId(id)}
            error={errors.planId}
          />
          <Field label="Start date" error={errors.startDate}>
            {(f) => (
              <LibraryInput
                {...f}
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Expiry date (optional)"
            error={errors.expiryDate}
            hint="Leave empty for an open-ended subscription."
          >
            {(f) => (
              <LibraryInput
                {...f}
                type="date"
                className={inputClass}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            )}
          </Field>
          <Field label="Payment terms (days)" error={errors.paymentTermsDays}>
            {(f) => (
              <LibraryInput
                {...f}
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Notes (optional)"
            error={errors.notes}
            className="md:col-span-2"
          >
            {(f) => (
              <LibraryTextarea
                {...f}
                rows={3}
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            )}
          </Field>
        </div>
      </Card>
      <Card title="Lines">
        <LinesEditor lines={lines} onChange={setLines} errors={errors} />
      </Card>
      <ErrorNotice error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" busy={saving}>
          {subscription ? "Save changes" : "Create subscription"}
        </Button>
      </div>
    </form>
  );
}
