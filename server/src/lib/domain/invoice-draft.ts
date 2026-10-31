import { invariant } from "./errors.js";
import {
  discountSaving,
  eligibleForBasis,
  validateDiscount,
  type DiscountRule,
} from "./discount.js";
import {
  addMinor,
  allocateMinor,
  computeLineTax,
  fromMinor,
  lineSubtotal,
  toMinor,
} from "./money.js";
import { parseDate, type DateOnly } from "./period.js";

export interface TaxRate {
  id: string;
  name: string;
  percentage: string;
}
export interface ChargeInput {
  productId: string | null;
  variantId?: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  taxes: readonly TaxRate[];
}
export interface DiscountAllocation {
  discountId: string;
  amount: string;
}
export interface FrozenTax {
  taxId: string;
  name: string;
  percentage: string;
  amount: string;
  /** Frozen evidence of invoice-time discounts reducing the tax base. */
  taxableBase: string;
  grossBase: string;
  discountAmount: string;
  discounts: DiscountAllocation[];
}
export interface DraftLine {
  kind: "CHARGE" | "DISCOUNT";
  productId: string | null;
  variantId: string | null;
  discountId: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  taxes: FrozenTax[];
  position: number;
  /** Calculation/audit result; persistence maps fields explicitly. */
  discountAllocations: DiscountAllocation[];
}
export interface InvoiceDraft {
  lines: DraftLine[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  appliedDiscountIds: string[];
  discountUsages: { discountId: string; amount: string }[];
}
export interface InvoiceDraftInput {
  periodStart: DateOnly;
  charges: readonly ChargeInput[];
  discounts: readonly DiscountRule[];
}

const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Pure, exact invoice calculation. No ORM, clock, network, or mutable global state. */
export function buildInvoiceDraft(input: InvoiceDraftInput): InvoiceDraft {
  parseDate(input.periodStart);
  invariant(
    input.charges.length > 0 && input.charges.length <= 101,
    "INVALID_INVOICE",
    "Invoice must contain a plan fee and at most 100 product lines",
  );
  invariant(
    input.discounts.length <= 1000,
    "BILLING_CONFIGURATION_LIMIT",
    "At most 1000 candidate discount rules are supported per invoice",
  );
  invariant(
    new Set(input.discounts.map((rule) => rule.id)).size ===
      input.discounts.length,
    "INVALID_DISCOUNT",
    "Discount IDs must be unique",
  );
  const charges = input.charges.map((charge) => {
    invariant(
      charge.description.trim().length > 0,
      "INVALID_INVOICE",
      "Charge description cannot be empty",
    );
    invariant(
      new Set(charge.taxes.map((tax) => tax.id)).size === charge.taxes.length,
      "INVALID_TAX",
      "A tax may appear only once on each charge",
    );
    const subtotal = lineSubtotal(toMinor(charge.unitPrice), charge.quantity);
    return {
      input: charge,
      subtotal,
      remaining: subtotal,
      allocations: new Map<string, number>(),
      productDiscountApplied: false,
    };
  });
  const subtotal = addMinor(...charges.map((charge) => charge.subtotal));
  const allQuantity = charges.reduce(
    (sum, charge) =>
      sum + (charge.input.productId === null ? 0 : charge.input.quantity),
    0,
  );
  invariant(
    Number.isSafeInteger(allQuantity),
    "INVALID_QUANTITY",
    "Total product quantity is out of range",
  );
  const candidates = input.discounts
    .filter((rule) => {
      validateDiscount(rule);
      const eligible = charges.filter(
        (charge) =>
          rule.scope === "SUBSCRIPTION" ||
          (charge.input.productId !== null &&
            rule.productIds.includes(charge.input.productId)),
      );
      const quantity =
        rule.scope === "SUBSCRIPTION"
          ? allQuantity
          : eligible.reduce((sum, charge) => sum + charge.input.quantity, 0);
      const base = addMinor(...eligible.map((charge) => charge.subtotal));
      return (
        eligible.length > 0 &&
        eligibleForBasis(rule, input.periodStart, quantity, base)
      );
    })
    .sort((a, b) => compareId(a.id, b.id));
  const fixedBudget = new Map(
    candidates
      .filter((rule) => rule.type === "FIXED")
      .map((rule) => [rule.id, toMinor(rule.value)]),
  );
  function apply(index: number, rule: DiscountRule, saving: number): void {
    if (saving === 0) return;
    const charge = charges[index]!;
    invariant(
      saving > 0 && saving <= charge.remaining,
      "INVALID_DISCOUNT",
      "Discount exceeds its eligible remaining charge",
    );
    charge.remaining -= saving;
    charge.allocations.set(
      rule.id,
      addMinor(charge.allocations.get(rule.id) ?? 0, saving),
    );
    if (rule.type === "FIXED")
      fixedBudget.set(rule.id, fixedBudget.get(rule.id)! - saving);
  }
  // Best saving per line. Resolve globally by saving, rule UUID, then stable line position.
  // A fixed rule's remaining budget is shared by ALL matching lines on this invoice.
  const productRules = candidates.filter((rule) => rule.scope === "PRODUCT");
  for (let iteration = 0; iteration < charges.length; iteration++) {
    let best: { index: number; rule: DiscountRule; saving: number } | undefined;
    for (let index = 0; index < charges.length; index++) {
      const charge = charges[index]!;
      if (
        charge.productDiscountApplied ||
        charge.input.productId === null ||
        charge.remaining === 0
      )
        continue;
      for (const rule of productRules) {
        if (!rule.productIds.includes(charge.input.productId)) continue;
        const saving =
          rule.type === "FIXED"
            ? Math.min(charge.remaining, fixedBudget.get(rule.id)!)
            : discountSaving(rule, charge.remaining);
        if (
          saving > 0 &&
          (!best ||
            saving > best.saving ||
            (saving === best.saving &&
              (compareId(rule.id, best.rule.id) < 0 ||
                (rule.id === best.rule.id && index < best.index))))
        )
          best = { index, rule, saving };
      }
    }
    if (!best) break;
    apply(best.index, best.rule, best.saving);
    charges[best.index]!.productDiscountApplied = true;
  }
  // Subscription rules stack after product promotions, in UUID order, on remaining base.
  for (const rule of candidates.filter(
    (candidate) => candidate.scope === "SUBSCRIPTION",
  )) {
    const remaining = charges.map((charge) => charge.remaining);
    const saving = discountSaving(rule, addMinor(...remaining));
    const allocations = allocateMinor(saving, remaining);
    allocations.forEach((amount, index) => apply(index, rule, amount));
  }
  const usages = new Map<string, number>();
  const lines: DraftLine[] = charges.map((charge, position) => {
    const discountAllocations = [...charge.allocations]
      .sort(([a], [b]) => compareId(a, b))
      .map(([discountId, amount]) => {
        usages.set(discountId, addMinor(usages.get(discountId) ?? 0, amount));
        return { discountId, amount: fromMinor(amount) };
      });
    const taxes = [...charge.input.taxes]
      .sort((a, b) => compareId(a.id, b.id))
      .map((tax) => ({
        taxId: tax.id,
        name: tax.name,
        percentage: tax.percentage,
        amount: fromMinor(computeLineTax(charge.remaining, tax.percentage)),
        taxableBase: fromMinor(charge.remaining),
        grossBase: fromMinor(charge.subtotal),
        discountAmount: fromMinor(charge.subtotal - charge.remaining),
        discounts: discountAllocations.map((allocation) => ({ ...allocation })),
      }));
    const taxTotal = addMinor(...taxes.map((tax) => toMinor(tax.amount)));
    return {
      kind: "CHARGE",
      productId: charge.input.productId,
      variantId: charge.input.variantId ?? null,
      discountId: null,
      description: charge.input.description,
      quantity: charge.input.quantity,
      unitPrice: fromMinor(toMinor(charge.input.unitPrice)),
      subtotal: fromMinor(charge.subtotal),
      taxTotal: fromMinor(taxTotal),
      total: fromMinor(addMinor(charge.subtotal, taxTotal)),
      taxes,
      position,
      discountAllocations,
    };
  });
  const discountUsages = [...usages]
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => compareId(a, b))
    .map(([discountId, amount]) => ({ discountId, amount: fromMinor(amount) }));
  for (const usage of discountUsages) {
    const rule = candidates.find(
      (candidate) => candidate.id === usage.discountId,
    )!;
    const negative = fromMinor(-toMinor(usage.amount));
    lines.push({
      kind: "DISCOUNT",
      productId: null,
      variantId: null,
      discountId: usage.discountId,
      description: rule.name,
      quantity: 1,
      unitPrice: negative,
      subtotal: negative,
      taxTotal: "0.00",
      total: negative,
      taxes: [],
      position: lines.length,
      discountAllocations: [],
    });
  }
  const discountTotal = addMinor(
    ...discountUsages.map((usage) => toMinor(usage.amount)),
  );
  const taxTotal = addMinor(...lines.map((line) => toMinor(line.taxTotal)));
  const total = addMinor(subtotal, -discountTotal, taxTotal);
  invariant(
    total >= 0 &&
      addMinor(...lines.map((line) => toMinor(line.total))) === total,
    "INVALID_INVOICE",
    "Invoice totals do not reconcile",
  );
  return {
    lines,
    subtotal: fromMinor(subtotal),
    discountTotal: fromMinor(discountTotal),
    taxTotal: fromMinor(taxTotal),
    total: fromMinor(total),
    appliedDiscountIds: discountUsages.map((usage) => usage.discountId),
    discountUsages,
  };
}
