import { NativeSelect as LibraryNativeSelect } from "../../../components/ui/primitives/native-select";
import { Input as LibraryInput } from "../../../components/ui/primitives/input";
import { Textarea as LibraryTextarea } from "../../../components/ui/primitives/textarea";
import { useId, useState, type FormEvent } from "react";
import { ErrorNotice, fieldErrors } from "../../../components/ops/errors";
import { label, money, today } from "../../../components/ops/format";
import { Button, Field, inputClass, Modal } from "../../../components/ops/ui";
import type { Invoice, Payment, PaymentMethod } from "../../../types/api";
import { useCreatePayment } from "../api";
import { InvoicePicker } from "./InvoicePicker";

const METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "UPI", "CARD"];
const AMOUNT_FORMAT = /^\d+(\.\d{1,2})?$/;

type Target = Pick<Invoice, "id" | "number" | "outstanding" | "customerName">;

/** "250" or "250.5" to "250.00" (text only, no arithmetic). */
function twoDecimals(text: string): string {
  const [whole, fraction = ""] = text.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

/**
 * Record-a-payment dialog. With `invoice` the invoice is fixed (invoice page); without it the user first picks an open invoice.
 * All rules (status, amount against the balance, dates) are enforced by the server and its message is shown here.
 */
export function RecordPaymentDialog({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice?: Target;
  onClose: () => void;
  onRecorded: (payment: Payment) => void;
}) {
  const formId = useId();
  const mutation = useCreatePayment();
  const [picked, setPicked] = useState<Target | undefined>(undefined);
  const target = invoice ?? picked;
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [amount, setAmount] = useState<string | undefined>(undefined);
  const [paidOn, setPaidOn] = useState(today());
  const [note, setNote] = useState("");
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const amountText = amount ?? target?.outstanding ?? "";
  const serverFields = fieldErrors(mutation.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    const errors: Record<string, string> = {};
    if (!AMOUNT_FORMAT.test(amountText.trim()))
      errors.amount = "Enter an amount such as 250 or 250.00.";
    if (!paidOn) errors.date = "Choose the payment date.";
    setLocalErrors(errors);
    if (Object.keys(errors).length) return;
    mutation.mutate(
      {
        invoiceId: target.id,
        method,
        amount: twoDecimals(amountText.trim()),
        date: paidOn,
        note: note.trim() || null,
      },
      { onSuccess: (response) => onRecorded(response.data) },
    );
  };

  return (
    <Modal
      title={
        invoice ? `Record payment for ${invoice.number}` : "Record payment"
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            busy={mutation.isPending}
            disabled={!target}
          >
            Record payment
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {!invoice && (
          <InvoicePicker
            selectedId={picked?.id ?? ""}
            onSelect={(chosen) => {
              setPicked(chosen);
              setAmount(undefined);
              mutation.reset();
            }}
          />
        )}
        {target && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            Invoice <span className="font-medium">{target.number}</span> ·{" "}
            {target.customerName} · Outstanding{" "}
            <span className="font-medium">{money(target.outstanding)}</span>
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method" error={serverFields.method}>
            {(f) => (
              <LibraryNativeSelect
                {...f}
                className={inputClass}
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {label(m)}
                  </option>
                ))}
              </LibraryNativeSelect>
            )}
          </Field>
          <Field
            label="Amount (INR)"
            error={localErrors.amount ?? serverFields.amount}
          >
            {(f) => (
              <LibraryInput
                {...f}
                className={inputClass}
                inputMode="decimal"
                autoComplete="off"
                value={amountText}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field
          label="Payment date"
          error={localErrors.date ?? serverFields.date}
        >
          {(f) => (
            <LibraryInput
              {...f}
              type="date"
              className={inputClass}
              value={paidOn}
              max={today()}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          )}
        </Field>
        <Field label="Note (optional)" error={serverFields.note}>
          {(f) => (
            <LibraryTextarea
              {...f}
              rows={2}
              maxLength={500}
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        <ErrorNotice error={mutation.error} />
      </form>
    </Modal>
  );
}
