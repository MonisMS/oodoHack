import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_STATUSES,
  INVOICE_STATUSES,
  allowedTransitions,
  canTransition,
  canTransitionInvoice,
  planSubscriptionTransition,
  type SubscriptionTransitionContext,
} from "../../src/lib/domain/states.js";
const context: SubscriptionTransitionContext = {
  today: "2026-10-31",
  expiryDate: "2026-12-31",
  plan: { pausable: false, renewable: false, closableEarly: false },
};

describe("explicit state machines", () => {
  it("checks every subscription from/to pair with conservative plan flags", () => {
    const expected = new Set([
      "DRAFT:QUOTATION",
      "DRAFT:CLOSED",
      "QUOTATION:CONFIRMED",
      "QUOTATION:CLOSED",
      "CONFIRMED:ACTIVE",
      "CONFIRMED:CLOSED",
    ]);
    for (const from of SUBSCRIPTION_STATUSES)
      for (const to of SUBSCRIPTION_STATUSES)
        expect(
          canTransition("subscription", from, to, context),
          `${from} -> ${to}`,
        ).toBe(expected.has(`${from}:${to}`));
  });
  it("enforces pause, early close, expiry and renewal conditions", () => {
    const flexible = {
      ...context,
      plan: { pausable: true, renewable: true, closableEarly: true },
    };
    expect(allowedTransitions("subscription", "ACTIVE", flexible)).toEqual([
      "PAUSED",
      "CLOSED",
    ]);
    expect(canTransition("subscription", "PAUSED", "ACTIVE", flexible)).toBe(
      true,
    );
    expect(
      canTransition("subscription", "PAUSED", "ACTIVE", {
        ...flexible,
        expiryDate: "2026-10-30",
      }),
    ).toBe(false);
    expect(
      canTransition("subscription", "ACTIVE", "CLOSED", {
        ...context,
        expiryDate: "2026-10-30",
      }),
    ).toBe(true);
    expect(
      canTransition("subscription", "ACTIVE", "CLOSED", {
        ...context,
        expiryDate: "2026-10-31",
      }),
    ).toBe(false);
    expect(
      canTransition("subscription", "CLOSED", "ACTIVE", {
        ...flexible,
        renewalExpiryDate: "2027-01-01",
      }),
    ).toBe(true);
    for (const renewalExpiryDate of [undefined, "2026-10-31", "2026-12-31"])
      expect(
        canTransition("subscription", "CLOSED", "ACTIVE", {
          ...flexible,
          renewalExpiryDate,
        }),
      ).toBe(false);
  });
  it("checks every invoice pair before and after payment", () => {
    for (const from of INVOICE_STATUSES)
      for (const to of INVOICE_STATUSES) {
        const expected =
          (from === "DRAFT" && ["CONFIRMED", "CANCELLED"].includes(to)) ||
          (from === "CONFIRMED" && to === "CANCELLED");
        expect(
          canTransition("invoice", from, to, {
            totalMinor: 100,
            amountPaidMinor: 0,
            paymentCount: 0,
          }),
          `${from} -> ${to}`,
        ).toBe(expected);
      }
    expect(
      allowedTransitions("invoice", "CONFIRMED", {
        totalMinor: 100,
        amountPaidMinor: 50,
        paymentCount: 1,
      }),
    ).toEqual(["PARTIALLY_PAID"]);
    expect(
      allowedTransitions("invoice", "PARTIALLY_PAID", {
        totalMinor: 100,
        amountPaidMinor: 100,
        paymentCount: 2,
      }),
    ).toEqual(["PAID"]);
    expect(
      allowedTransitions("invoice", "DRAFT", {
        totalMinor: 0,
        amountPaidMinor: 0,
        paymentCount: 0,
      }),
    ).toEqual(["PAID", "CANCELLED"]);
    expect(() =>
      allowedTransitions("invoice", "CONFIRMED", {
        totalMinor: 100,
        amountPaidMinor: 101,
        paymentCount: 1,
      }),
    ).toThrow();
    expect(() =>
      allowedTransitions("invoice", "CONFIRMED", {
        totalMinor: 100,
        amountPaidMinor: 50,
        paymentCount: 0,
      }),
    ).toThrow();
  });
  it("waives paused/closed gaps while preserving existing invoice coverage and active debts", () => {
    const schedule = {
      ...context,
      plan: { pausable: true, renewable: true, closableEarly: true },
      startDate: "2026-01-01",
      nextInvoiceDate: "2026-06-01",
      billingAnchorDay: 1,
      billingAnchorMonth: 1,
      lastInvoicePeriodEnd: "2026-06-01",
    };
    expect(
      planSubscriptionTransition("PAUSED", "ACTIVE", schedule),
    ).toMatchObject({
      nextInvoiceDate: "2026-10-31",
      billingAnchorDay: 31,
      billingAnchorMonth: 10,
    });
    expect(
      planSubscriptionTransition("CLOSED", "ACTIVE", {
        ...schedule,
        renewalExpiryDate: "2027-12-31",
      }),
    ).toMatchObject({
      nextInvoiceDate: "2026-10-31",
      expiryDate: "2027-12-31",
    });
    expect(
      planSubscriptionTransition("PAUSED", "ACTIVE", {
        ...schedule,
        lastInvoicePeriodEnd: "2026-11-15",
      }).nextInvoiceDate,
    ).toBe("2026-11-15");
    expect(() =>
      planSubscriptionTransition("ACTIVE", "PAUSED", schedule),
    ).toThrow(/Run billing/);
    expect(
      planSubscriptionTransition("ACTIVE", "PAUSED", {
        ...schedule,
        nextInvoiceDate: "2026-11-01",
      }).nextInvoiceDate,
    ).toBe("2026-11-01");
  });
  it("restarts future subscriptions at their start or existing coverage, with valid anchors", () => {
    const future = {
      ...context,
      startDate: "2026-12-15",
      nextInvoiceDate: "2026-12-15",
      billingAnchorDay: 15,
      billingAnchorMonth: 12,
      lastInvoicePeriodEnd: null,
      plan: { pausable: true, renewable: true, closableEarly: true },
    };
    for (const from of ["PAUSED", "CLOSED"] as const) {
      const result = planSubscriptionTransition(from, "ACTIVE", {
        ...future,
        renewalExpiryDate: "2027-12-31",
      });
      expect(result).toMatchObject({
        nextInvoiceDate: "2026-12-15",
        billingAnchorDay: 15,
        billingAnchorMonth: 12,
      });
      expect(
        planSubscriptionTransition(from, "ACTIVE", {
          ...future,
          renewalExpiryDate: "2027-12-31",
          lastInvoicePeriodEnd: "2026-12-31",
        }).nextInvoiceDate,
      ).toBe("2026-12-31");
    }
    expect(() =>
      planSubscriptionTransition("CLOSED", "ACTIVE", {
        ...future,
        expiryDate: null,
        renewalExpiryDate: "2026-11-30",
      }),
    ).toThrow(/ends before/);
    expect(() =>
      planSubscriptionTransition("PAUSED", "ACTIVE", {
        ...future,
        startDate: "invalid",
      }),
    ).toThrow();
  });
  it("only reopens cancelled invoices with no money and explicit uncovered-period verification", () => {
    const empty = { totalMinor: 100, amountPaidMinor: 0, paymentCount: 0 };
    expect(canTransition("invoice", "CANCELLED", "DRAFT", empty)).toBe(false);
    expect(
      canTransition("invoice", "CANCELLED", "DRAFT", {
        ...empty,
        periodUncovered: true,
      }),
    ).toBe(true);
    expect(
      canTransition("invoice", "CANCELLED", "DRAFT", {
        ...empty,
        amountPaidMinor: 1,
        paymentCount: 1,
        periodUncovered: true,
      }),
    ).toBe(false);
    expect(
      canTransitionInvoice("CANCELLED", "DRAFT", {
        paymentCount: 0,
        periodUncovered: true,
      }).ok,
    ).toBe(true);
    expect(
      canTransitionInvoice("CANCELLED", "DRAFT", { paymentCount: 0 }).ok,
    ).toBe(false);
    expect(
      canTransitionInvoice("CANCELLED", "DRAFT", {
        paymentCount: 1,
        periodUncovered: true,
      }).ok,
    ).toBe(false);
    expect(
      canTransitionInvoice("PAID", "DRAFT", {
        paymentCount: 1,
        periodUncovered: true,
      }).ok,
    ).toBe(false);
  });
});
