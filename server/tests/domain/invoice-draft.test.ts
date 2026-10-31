import { describe, expect, it } from "vitest";
import {
  buildInvoiceDraft,
  type ChargeInput,
} from "../../src/lib/domain/invoice-draft.js";
import {
  findApplicableDiscounts,
  type DiscountRule,
} from "../../src/lib/domain/discount.js";
import { toMinor } from "../../src/lib/domain/money.js";

const tax = { id: "tax", name: "Illustrative tax", percentage: "18" };
const charge = (
  productId: string | null,
  unitPrice = "1000.00",
  quantity = 1,
): ChargeInput => ({
  productId,
  description: productId ?? "Plan",
  unitPrice,
  quantity,
  taxes: [tax],
});
const rule = (overrides: Partial<DiscountRule> = {}): DiscountRule => ({
  id: "a",
  name: "Promotion",
  type: "PERCENTAGE",
  scope: "SUBSCRIPTION",
  value: "10.00",
  productIds: [],
  minPurchase: null,
  minQuantity: null,
  startsAt: "2026-01-01",
  endsAt: null,
  usageLimit: null,
  usedCount: 0,
  isActive: true,
  ...overrides,
});
const draft = (charges: ChargeInput[], discounts: DiscountRule[]) =>
  buildInvoiceDraft({ periodStart: "2026-10-31", charges, discounts });

describe("invoice-time discounts and frozen taxes", () => {
  it("uses the approved 1000 minus 100 taxable-base example", () => {
    const result = draft([charge(null)], [rule()]);
    expect(result).toMatchObject({
      subtotal: "1000.00",
      discountTotal: "100.00",
      taxTotal: "162.00",
      total: "1062.00",
    });
    expect(result.lines[0]!.taxes[0]).toMatchObject({
      grossBase: "1000.00",
      taxableBase: "900.00",
      discountAmount: "100.00",
      amount: "162.00",
    });
    expect(result.lines[1]).toMatchObject({
      kind: "DISCOUNT",
      unitPrice: "-100.00",
      quantity: 1,
      taxTotal: "0.00",
      taxes: [],
    });
  });
  it("matches an independently calculated plan/product/stacked-discount golden invoice", () => {
    const result = draft(
      [charge(null), charge("product", "500.00", 2)],
      [
        rule({ id: "product-rule", scope: "PRODUCT", productIds: ["product"] }),
        rule({ id: "subscription-rule", type: "FIXED", value: "200.00" }),
      ],
    );
    expect(result).toMatchObject({
      subtotal: "2000.00",
      discountTotal: "300.00",
      taxTotal: "306.00",
      total: "2006.00",
    });
    expect(result.discountUsages).toEqual([
      { discountId: "product-rule", amount: "100.00" },
      { discountId: "subscription-rule", amount: "200.00" },
    ]);
  });
  it("caps a fixed product promotion once per invoice across split lines", () => {
    const fixed = rule({
      type: "FIXED",
      value: "100.00",
      scope: "PRODUCT",
      productIds: ["p"],
    });
    const one = draft([charge("p")], [fixed]);
    const split = draft(
      [charge("p", "500.00"), charge("p", "500.00")],
      [fixed],
    );
    expect(one.discountTotal).toBe("100.00");
    expect(split.discountTotal).toBe("100.00");
    expect(split.discountUsages).toHaveLength(1);
  });
  it("takes the best product discount with deterministic ties and no mutation of caller data", () => {
    const input = [
      rule({ id: "b", scope: "PRODUCT", productIds: ["p"] }),
      rule({ id: "a", scope: "PRODUCT", productIds: ["p"] }),
    ];
    const before = JSON.stringify(input);
    const result = draft([charge("p")], input);
    expect(result.appliedDiscountIds).toEqual(["a"]);
    expect(JSON.stringify(input)).toBe(before);
    expect(draft([charge("p")], [...input].reverse())).toEqual(result);
  });
  it("does not let unrelated products satisfy eligibility thresholds", () => {
    const result = draft(
      [charge("p", "5.00"), charge("other", "999.00", 100)],
      [
        rule({
          scope: "PRODUCT",
          productIds: ["p"],
          minQuantity: 2,
          minPurchase: "10.00",
        }),
      ],
    );
    expect(result.discountUsages).toEqual([]);
  });
  it("allocates mixed-rate subscription savings exactly before tax", () => {
    const result = draft(
      [
        { ...charge("a", "100.00"), taxes: [{ ...tax, percentage: "5" }] },
        { ...charge("b", "100.00"), taxes: [tax] },
      ],
      [rule({ type: "FIXED", value: "50.00" })],
    );
    expect(result).toMatchObject({
      subtotal: "200.00",
      discountTotal: "50.00",
      taxTotal: "17.25",
      total: "167.25",
    });
    expect(
      result.lines.slice(0, 2).map((line) => line.taxes[0]!.taxableBase),
    ).toEqual(["75.00", "75.00"]);
  });
  it("caps fixed discounts and never consumes zero-saving promotions", () => {
    const result = draft(
      [charge(null, "1.00")],
      [rule({ id: "a", type: "FIXED", value: "999.00" }), rule({ id: "b" })],
    );
    expect(result.total).toBe("0.00");
    expect(result.discountUsages).toEqual([
      { discountId: "a", amount: "1.00" },
    ]);
  });
  it("freezes snapshots independently of future input changes", () => {
    const taxes = [{ ...tax }];
    const result = draft([{ ...charge("p"), taxes }], [rule()]);
    taxes[0]!.percentage = "99";
    taxes[0]!.name = "Changed";
    expect(result.lines[0]!.taxes[0]!.percentage).toBe("18");
    expect(
      result.lines.reduce((sum, line) => sum + toMinor(line.total), 0),
    ).toBe(toMinor(result.total));
  });
  it("checks every eligibility exclusion and inclusive date boundary", () => {
    const ctx = {
      periodStart: "2026-10-31",
      productId: "p",
      quantity: 5,
      subtotalMinor: 10000,
    };
    expect(
      findApplicableDiscounts(
        [rule({ startsAt: ctx.periodStart, endsAt: ctx.periodStart })],
        ctx,
      ),
    ).toHaveLength(1);
    for (const overrides of [
      { isActive: false },
      { startsAt: "2026-11-01" },
      { endsAt: "2026-10-30" },
      { usageLimit: 1, usedCount: 1 },
      { minQuantity: 6 },
      { minPurchase: "100.01" },
      { scope: "PRODUCT" as const, productIds: ["other"] },
    ])
      expect(findApplicableDiscounts([rule(overrides)], ctx)).toEqual([]);
  });
  it("rejects invalid rules, duplicate tax IDs and invoice overflow", () => {
    expect(() => draft([charge("p")], [rule({ value: "101.00" })])).toThrow();
    expect(() => draft([{ ...charge("p"), taxes: [tax, tax] }], [])).toThrow();
    expect(() => draft([charge("p", "999999999999.99")], [])).toThrow();
  });
});
