import { Input as LibraryInput } from "../../../components/ui/primitives/input";
import { useState, type FormEvent } from "react";
import type { QuotationTemplate, TemplateInput } from "../../../types/api";
import { ErrorNotice, fieldErrors } from "../../../components/ops/errors";
import {
  PlanSelect,
  LinesEditor,
  blankLine,
  toLineInputs,
  type EditableLine,
} from "../../../components/ops/pickers";
import { Button, Card, Field, inputClass } from "../../../components/ops/ui";

const toEditable = (template?: QuotationTemplate): EditableLine[] =>
  template?.lines.length
    ? template.lines.map((l) => ({
        key: l.id,
        productId: l.productId,
        variantId: l.variantId,
        quantity: l.quantity,
        ...(l.unitPrice ? { unitPrice: l.unitPrice } : {}),
      }))
    : [blankLine()];

export function TemplateForm({
  template,
  saving,
  error,
  onSubmit,
  onCancel,
}: {
  template?: QuotationTemplate;
  saving: boolean;
  error: unknown;
  onSubmit: (input: TemplateInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [planId, setPlanId] = useState(template?.planId ?? "");
  const [validityDays, setValidityDays] = useState(
    String(template?.validityDays ?? 30),
  );
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [lines, setLines] = useState<EditableLine[]>(() =>
    toEditable(template),
  );
  const errors = fieldErrors(error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      planId,
      validityDays: Number(validityDays),
      isActive,
      lines: toLineInputs(lines),
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card title="Template details">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" error={errors.name}>
            {(f) => (
              <LibraryInput
                {...f}
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
          </Field>
          <PlanSelect
            value={planId}
            onChange={(id) => setPlanId(id)}
            error={errors.planId}
          />
          <Field
            label="Validity (days)"
            error={errors.validityDays}
            hint="How long a quotation made from this template stays valid (1 to 3650)."
          >
            {(f) => (
              <LibraryInput
                {...f}
                type="number"
                min={1}
                max={3650}
                step={1}
                className={inputClass}
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
              />
            )}
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              Active
            </label>
          </div>
        </div>
      </Card>
      <Card title="Lines">
        <LinesEditor lines={lines} onChange={setLines} errors={errors} />
      </Card>
      <ErrorNotice error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" busy={saving}>
          {template ? "Save changes" : "Create template"}
        </Button>
      </div>
    </form>
  );
}
