import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  productSchema,
  planSchema,
  discountSchema,
  normalizeMoney,
  errorsFrom,
  type Fields,
} from "../../lib/catalog-client";
import { api } from "../../lib/api";
import type { Product, Plan, Discount, Data } from "../../types/api";
import {
  FormField,
  Input,
  Select,
  Textarea,
  Toggle,
  Button,
  ErrorNotice,
  useToast,
} from "../ui/kit";
import { ReferencePicker } from "../ui/ReferencePicker";
import { Icon } from "../ui/Icon";
export type Kind = "products" | "plans" | "discounts";
export type Item = Product | Plan | Discount;
const schemas = {
  products: productSchema,
  plans: planSchema,
  discounts: discountSchema,
};
export const singular = {
  products: "product",
  plans: "plan",
  discounts: "discount",
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function initial(kind: Kind, item?: Item): Record<string, unknown> {
  if (item) return { ...item };
  return kind === "products"
    ? {
        name: "",
        type: "SERVICE",
        salesPrice: "",
        costPrice: "0.00",
        notes: "",
        isActive: true,
        taxIds: [],
      }
    : kind === "plans"
      ? {
          name: "",
          price: "",
          billingPeriod: "MONTHLY",
          minQuantity: 1,
          availableFrom: null,
          availableTo: null,
          autoClose: true,
          closableEarly: false,
          pausable: false,
          renewable: false,
          isActive: true,
          taxIds: [],
        }
      : {
          name: "",
          type: "PERCENTAGE",
          scope: "SUBSCRIPTION",
          value: "",
          minPurchase: null,
          minQuantity: null,
          startsAt: today(),
          endsAt: null,
          usageLimit: null,
          isActive: true,
          productIds: [],
        };
}
export function CatalogForm({
  kind,
  item,
  onCancel,
}: {
  kind: Kind;
  item?: Item;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(() => initial(kind, item));
  const [fields, setFields] = useState<Fields>({});
  const [localError, setLocalError] = useState<unknown>();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { notify } = useToast();
  const set = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFields((f) => ({ ...f, [key]: [] }));
  };
  const save = useMutation({
    mutationFn: async (input: unknown) =>
      (
        await api<Data<Item>>(`/${kind}${item ? "/" + item.id : ""}`, {
          method: item ? "PUT" : "POST",
          body: JSON.stringify(input),
        })
      ).data,
    onSuccess: async (saved) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: [kind] }),
        cache.invalidateQueries({ queryKey: ["reference", "/" + kind] }),
      ]);
      cache.setQueryData([kind, saved.id], saved);
      notify(
        `${singular[kind][0].toUpperCase() + singular[kind].slice(1)} ${item ? "updated" : "created"}`,
      );
      navigate(`/${kind}/${saved.id}`);
      onCancel?.();
    },
    onError: (error) => setFields(errorsFrom(error)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError(undefined);
    const clean = { ...draft };
    const form = new FormData(event.currentTarget as HTMLFormElement);
    for (const key of ["availableFrom", "availableTo", "startsAt", "endsAt"]) {
      if (key in clean)
        clean[key] =
          String(form.get(key) ?? "") || (key === "startsAt" ? "" : null);
    }
    for (const field of [
      "salesPrice",
      "costPrice",
      "price",
      "value",
      "minPurchase",
    ])
      if (typeof clean[field] === "string" && clean[field] !== "")
        clean[field] = normalizeMoney(clean[field] as string);
    const result = schemas[kind].safeParse(clean);
    if (!result.success) {
      setFields(errorsFrom(result.error));
      setLocalError(new Error("Please check the highlighted fields."));
      return;
    }
    setFields({});
    save.mutate(result.data);
  };
  const text = (
    key: string,
    label: string,
    options: {
      type?: string;
      hint?: string;
      required?: boolean;
      placeholder?: string;
      nullable?: boolean;
    } = {},
  ) => (
    <FormField
      key={key}
      label={label}
      error={fields[key]}
      hint={options.hint}
      required={options.required}
    >
      <Input
        name={key}
        type={options.type ?? "text"}
        {...(options.type === "date"
          ? { defaultValue: String(draft[key] ?? "") }
          : { value: String(draft[key] ?? "") })}
        required={options.required}
        placeholder={options.placeholder}
        inputMode={
          ["salesPrice", "costPrice", "price", "value", "minPurchase"].includes(
            key,
          )
            ? "decimal"
            : undefined
        }
        min={options.type === "number" ? 1 : undefined}
        onChange={(e) =>
          set(
            key,
            options.type === "number"
              ? e.target.value === ""
                ? null
                : Number(e.target.value)
              : options.nullable && e.target.value === ""
                ? null
                : e.target.value,
          )
        }
      />
    </FormField>
  );
  const select = (key: string, label: string, options: [string, string][]) => (
    <FormField label={label} error={fields[key]}>
      <Select
        value={String(draft[key])}
        onChange={(e) => {
          set(key, e.target.value);
          if (key === "scope" && e.target.value === "SUBSCRIPTION")
            set("productIds", []);
        }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </FormField>
  );
  return (
    <div className="form-layout">
      <form className="panel" onSubmit={submit} noValidate>
        <section className="form-section">
          <h3>
            {kind === "discounts" ? "Discount details" : "General information"}
          </h3>
          <ErrorNotice error={localError ?? save.error} />
          <div className="form-grid">
            <div className="span-2">
              {text(
                "name",
                `${singular[kind][0].toUpperCase() + singular[kind].slice(1)} name`,
                {
                  required: true,
                  placeholder:
                    kind === "products"
                      ? "e.g. Business software"
                      : kind === "plans"
                        ? "e.g. Professional monthly"
                        : "e.g. Annual loyalty discount",
                },
              )}
            </div>
            {kind === "products" && (
              <>
                {select("type", "Product type", [
                  ["SERVICE", "Service"],
                  ["DIGITAL", "Digital product"],
                  ["PHYSICAL", "Physical product"],
                ])}
                {text("salesPrice", "Sales price · INR", {
                  required: true,
                  placeholder: "0.00",
                })}
                {text("costPrice", "Cost price · INR", {
                  required: true,
                  placeholder: "0.00",
                  hint: "Internal reference; not charged to the customer.",
                })}
                <div className="span-2">
                  <FormField label="Notes" error={fields.notes}>
                    <Textarea
                      maxLength={4000}
                      value={String(draft.notes ?? "")}
                      placeholder="A short description or useful internal context"
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </FormField>
                </div>
              </>
            )}
            {kind === "plans" && (
              <>
                {text("price", "Plan fee · INR", {
                  required: true,
                  placeholder: "0.00",
                  hint: "Charged once per billing period, separately from products.",
                })}
                {select("billingPeriod", "Billing frequency", [
                  ["DAILY", "Daily"],
                  ["WEEKLY", "Weekly"],
                  ["MONTHLY", "Monthly"],
                  ["YEARLY", "Yearly"],
                ])}
                {text("minQuantity", "Minimum quantity", {
                  type: "number",
                  required: true,
                })}
                <div />
                {text("availableFrom", "Available from", {
                  type: "date",
                  nullable: true,
                })}
                {text("availableTo", "Available until", {
                  type: "date",
                  nullable: true,
                })}
              </>
            )}
            {kind === "discounts" && (
              <>
                {select("type", "Discount type", [
                  ["PERCENTAGE", "Percentage"],
                  ["FIXED", "Fixed amount"],
                ])}
                {text(
                  "value",
                  draft.type === "PERCENTAGE"
                    ? "Percentage · %"
                    : "Discount amount · INR",
                  {
                    required: true,
                    placeholder: draft.type === "PERCENTAGE" ? "10.00" : "0.00",
                  },
                )}
                {select("scope", "Applies to", [
                  ["SUBSCRIPTION", "Whole subscription"],
                  ["PRODUCT", "Selected products"],
                ])}
                <div />
                {text("startsAt", "Starts on", {
                  type: "date",
                  required: true,
                })}
                {text("endsAt", "Ends on", { type: "date", nullable: true })}
                {text("minPurchase", "Minimum purchase · INR", {
                  nullable: true,
                  placeholder: "No minimum",
                })}
                {text("minQuantity", "Minimum quantity", {
                  type: "number",
                  nullable: true,
                  placeholder: "No minimum",
                })}
                {text("usageLimit", "Usage limit", {
                  type: "number",
                  nullable: true,
                  placeholder: "Unlimited",
                  hint: "Counted once per invoice. Existing usage cannot be reset.",
                })}
                {item && (
                  <div>
                    <p className="field-hint" style={{ marginTop: 25 }}>
                      Already used{" "}
                      <strong>{(item as Discount).usedCount}</strong> times.
                    </p>
                  </div>
                )}
                {draft.scope === "PRODUCT" && (
                  <div className="span-2">
                    <FormField
                      label="Eligible products"
                      error={fields.productIds}
                      required
                    >
                      <ReferencePicker
                        path="/products"
                        label="Products"
                        value={draft.productIds as string[]}
                        onChange={(v) => set("productIds", v)}
                        multiple
                      />
                    </FormField>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
        {kind !== "discounts" && (
          <section className="form-section">
            <h3>Tax rules</h3>
            <FormField
              label="Linked taxes"
              error={fields.taxIds}
              hint="Taxes are calculated by the server when an invoice is generated."
            >
              <ReferencePicker
                path="/taxes"
                label="Taxes"
                value={draft.taxIds as string[]}
                onChange={(v) => set("taxIds", v)}
                multiple
                optionalService
              />
            </FormField>
          </section>
        )}
        <section className="form-section">
          <h3>Availability & permissions</h3>
          <Toggle
            label="Active"
            hint="Active entries can be selected for new subscriptions."
            checked={Boolean(draft.isActive)}
            onChange={(v) => set("isActive", v)}
          />
          {kind === "plans" &&
            [
              [
                "autoClose",
                "Close automatically",
                "Close when the final billable period has been invoiced.",
              ],
              [
                "closableEarly",
                "Allow early closure",
                "Staff can close the subscription before its expiry.",
              ],
              [
                "pausable",
                "Allow pause and resume",
                "Paused gaps remain uncharged.",
              ],
              [
                "renewable",
                "Allow renewal",
                "Start a new term after the subscription closes.",
              ],
            ].map(([key, label, hint]) => (
              <Toggle
                key={key}
                label={label}
                hint={hint}
                checked={Boolean(draft[key])}
                onChange={(v) => set(key, v)}
              />
            ))}
        </section>
        <footer className="form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={save.isPending}
            onClick={() => (onCancel ? onCancel() : navigate("/" + kind))}
          >
            Cancel
          </Button>
          <Button disabled={save.isPending} type="submit">
            {save.isPending
              ? "Saving…"
              : item
                ? "Save changes"
                : `Create ${singular[kind]}`}
            <Icon name="arrow" size={14} />
          </Button>
        </footer>
      </form>
      <aside className="aside-note">
        <Icon
          name={
            kind === "products" ? "box" : kind === "plans" ? "layers" : "tag"
          }
          size={23}
        />
        <h3>
          {kind === "products"
            ? "A clear product catalog"
            : kind === "plans"
              ? "Flexible plans, consistent billing"
              : "Discounts that apply themselves"}
        </h3>
        <p>
          {kind === "products"
            ? "Keep the base price here. Add brand or package options as variants after saving. Each extra price is added exactly once."
            : kind === "plans"
              ? "Plan fees are separate from product lines. A subscription keeps its plan price until it is renewed."
              : "Eligible discounts are applied automatically to invoices, within your dates, thresholds and usage limits."}
        </p>
        <p className="note-divider">
          {kind === "discounts"
            ? "Fixed discounts have one budget per invoice. Discounts reduce the taxable amount before tax."
            : "Changes to this catalog entry do not rewrite invoices that have already been generated."}
        </p>
      </aside>
    </div>
  );
}
