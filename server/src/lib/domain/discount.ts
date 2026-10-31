import { invariant } from "./errors.js";
import { assertMinor, computeLineTax, rateUnits, toMinor } from "./money.js";
import { parseDate, type DateOnly } from "./period.js";

export interface DiscountRule {
  id: string;
  name: string;
  type: "FIXED" | "PERCENTAGE";
  scope: "PRODUCT" | "SUBSCRIPTION";
  value: string;
  productIds: readonly string[];
  minPurchase: string | null;
  minQuantity: number | null;
  startsAt: DateOnly;
  endsAt: DateOnly | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
}
export interface DiscountContext {
  periodStart: DateOnly;
  productId: string | null;
  quantity: number;
  subtotalMinor: number;
}

export function validateDiscount(rule: DiscountRule): void {
  parseDate(rule.startsAt);
  if (rule.endsAt) parseDate(rule.endsAt);
  invariant(
    !rule.endsAt || rule.endsAt >= rule.startsAt,
    "INVALID_DISCOUNT",
    "Discount date range is invalid",
  );
  invariant(
    rule.type === "FIXED" || rule.type === "PERCENTAGE",
    "INVALID_DISCOUNT",
    "Unsupported discount type",
  );
  invariant(
    rule.scope === "PRODUCT" || rule.scope === "SUBSCRIPTION",
    "INVALID_DISCOUNT",
    "Unsupported discount scope",
  );
  invariant(
    toMinor(rule.value) > 0,
    "INVALID_DISCOUNT",
    "Discount value must be positive",
  );
  if (rule.type === "PERCENTAGE") rateUnits(rule.value);
  if (rule.minPurchase !== null)
    invariant(
      toMinor(rule.minPurchase) >= 0,
      "INVALID_DISCOUNT",
      "Minimum purchase cannot be negative",
    );
  invariant(
    rule.minQuantity === null ||
      (Number.isSafeInteger(rule.minQuantity) && rule.minQuantity >= 1),
    "INVALID_DISCOUNT",
    "Minimum quantity is invalid",
  );
  invariant(
    Number.isSafeInteger(rule.usedCount) && rule.usedCount >= 0,
    "INVALID_DISCOUNT",
    "Discount usage counter is invalid",
  );
  invariant(
    rule.usageLimit === null ||
      (Number.isSafeInteger(rule.usageLimit) &&
        rule.usageLimit >= 1 &&
        rule.usedCount <= rule.usageLimit),
    "INVALID_DISCOUNT",
    "Discount usage limit is invalid",
  );
  invariant(
    rule.scope === "PRODUCT"
      ? rule.productIds.length > 0
      : rule.productIds.length === 0,
    "INVALID_DISCOUNT",
    "Discount product scope is invalid",
  );
}

export function eligibleForBasis(
  rule: DiscountRule,
  periodStart: DateOnly,
  quantity: number,
  subtotalMinor: number,
): boolean {
  validateDiscount(rule);
  parseDate(periodStart);
  assertMinor(subtotalMinor);
  invariant(
    Number.isSafeInteger(quantity) && quantity >= 0 && subtotalMinor >= 0,
    "INVALID_DISCOUNT_CONTEXT",
    "Discount eligibility basis is invalid",
  );
  return (
    rule.isActive &&
    rule.startsAt <= periodStart &&
    (!rule.endsAt || periodStart <= rule.endsAt) &&
    (rule.usageLimit === null || rule.usedCount < rule.usageLimit) &&
    (rule.minQuantity === null || quantity >= rule.minQuantity) &&
    (rule.minPurchase === null || subtotalMinor >= toMinor(rule.minPurchase))
  );
}

/** Public contract helper: context is the full eligible scope, not unrelated purchases. */
export function findApplicableDiscounts<T extends DiscountRule>(
  rules: readonly T[],
  context: DiscountContext,
): T[] {
  return rules
    .filter(
      (rule) =>
        eligibleForBasis(
          rule,
          context.periodStart,
          context.quantity,
          context.subtotalMinor,
        ) &&
        (rule.scope === "SUBSCRIPTION" ||
          (context.productId !== null &&
            rule.productIds.includes(context.productId))),
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function discountSaving(rule: DiscountRule, baseMinor: number): number {
  assertMinor(baseMinor);
  invariant(
    baseMinor >= 0,
    "INVALID_DISCOUNT_CONTEXT",
    "Discount base cannot be negative",
  );
  return Math.min(
    baseMinor,
    rule.type === "FIXED"
      ? toMinor(rule.value)
      : computeLineTax(baseMinor, rule.value),
  );
}
