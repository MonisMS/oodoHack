import { invariant } from "./errors.js";
import { anchorFor, parseDate, type DateOnly } from "./period.js";

export type SubscriptionStatus =
  "DRAFT" | "QUOTATION" | "CONFIRMED" | "ACTIVE" | "PAUSED" | "CLOSED";
export type InvoiceStatus =
  "DRAFT" | "CONFIRMED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "DRAFT",
  "QUOTATION",
  "CONFIRMED",
  "ACTIVE",
  "PAUSED",
  "CLOSED",
];
export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
];

export interface SubscriptionTransitionContext {
  today: DateOnly;
  expiryDate?: DateOnly | null;
  renewalExpiryDate?: DateOnly;
  plan: { pausable: boolean; renewable: boolean; closableEarly: boolean };
}
export interface InvoiceTransitionContext {
  totalMinor: number;
  amountPaidMinor: number;
  paymentCount: number;
}

export function allowedSubscriptionTransitions(
  from: SubscriptionStatus,
  context: SubscriptionTransitionContext,
): SubscriptionStatus[] {
  parseDate(context.today);
  if (context.expiryDate) parseDate(context.expiryDate);
  if (context.renewalExpiryDate) parseDate(context.renewalExpiryDate);
  switch (from) {
    case "DRAFT":
      return ["QUOTATION", "CLOSED"];
    case "QUOTATION":
      return ["CONFIRMED", "CLOSED"];
    case "CONFIRMED":
      return ["ACTIVE", "CLOSED"];
    case "ACTIVE":
      return [
        ...(context.plan.pausable ? ["PAUSED" as const] : []),
        ...(context.plan.closableEarly ||
        (context.expiryDate && context.today > context.expiryDate)
          ? ["CLOSED" as const]
          : []),
      ];
    case "PAUSED":
      return [
        ...(context.plan.pausable &&
        (!context.expiryDate || context.today <= context.expiryDate)
          ? ["ACTIVE" as const]
          : []),
        ...(context.plan.closableEarly ||
        (context.expiryDate && context.today > context.expiryDate)
          ? ["CLOSED" as const]
          : []),
      ];
    case "CLOSED":
      return context.plan.renewable &&
        context.renewalExpiryDate &&
        context.renewalExpiryDate > context.today &&
        (!context.expiryDate || context.renewalExpiryDate > context.expiryDate)
        ? ["ACTIVE"]
        : [];
    default:
      return [];
  }
}

/** Payment-induced transitions still belong inside A's locked payment service. */
export function allowedInvoiceTransitions(
  from: InvoiceStatus,
  context: InvoiceTransitionContext,
): InvoiceStatus[] {
  const { totalMinor, amountPaidMinor, paymentCount } = context;
  invariant(
    Number.isSafeInteger(totalMinor) &&
      Number.isSafeInteger(amountPaidMinor) &&
      totalMinor >= 0 &&
      amountPaidMinor >= 0 &&
      amountPaidMinor <= totalMinor &&
      Number.isSafeInteger(paymentCount) &&
      paymentCount >= 0,
    "INVALID_INVOICE_STATE",
    "Invoice amounts or payment count are inconsistent",
  );
  invariant(
    (paymentCount === 0) === (amountPaidMinor === 0),
    "INVALID_INVOICE_STATE",
    "Payment count and collected amount disagree",
  );
  switch (from) {
    case "DRAFT":
      return paymentCount === 0 && amountPaidMinor === 0
        ? [totalMinor === 0 ? "PAID" : "CONFIRMED", "CANCELLED"]
        : [];
    case "CONFIRMED":
      return [
        ...(paymentCount === 0 && amountPaidMinor === 0
          ? ["CANCELLED" as const]
          : []),
        ...(amountPaidMinor > 0 && amountPaidMinor < totalMinor
          ? ["PARTIALLY_PAID" as const]
          : []),
        ...(amountPaidMinor === totalMinor ? ["PAID" as const] : []),
      ];
    case "PARTIALLY_PAID":
      return amountPaidMinor === totalMinor ? ["PAID"] : [];
    case "PAID":
    case "CANCELLED":
      return [];
    default:
      return [];
  }
}

export function allowedTransitions(
  kind: "subscription",
  from: SubscriptionStatus,
  context: SubscriptionTransitionContext,
): SubscriptionStatus[];
export function allowedTransitions(
  kind: "invoice",
  from: InvoiceStatus,
  context: InvoiceTransitionContext,
): InvoiceStatus[];
export function allowedTransitions(
  kind: "subscription" | "invoice",
  from: SubscriptionStatus | InvoiceStatus,
  context: SubscriptionTransitionContext | InvoiceTransitionContext,
): (SubscriptionStatus | InvoiceStatus)[] {
  return kind === "subscription"
    ? allowedSubscriptionTransitions(
        from as SubscriptionStatus,
        context as SubscriptionTransitionContext,
      )
    : allowedInvoiceTransitions(
        from as InvoiceStatus,
        context as InvoiceTransitionContext,
      );
}

export function canTransition(
  kind: "subscription",
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  context: SubscriptionTransitionContext,
): boolean;
export function canTransition(
  kind: "invoice",
  from: InvoiceStatus,
  to: InvoiceStatus,
  context: InvoiceTransitionContext,
): boolean;
export function canTransition(
  kind: "subscription" | "invoice",
  from: SubscriptionStatus | InvoiceStatus,
  to: SubscriptionStatus | InvoiceStatus,
  context: SubscriptionTransitionContext | InvoiceTransitionContext,
): boolean {
  if (from === to) return false;
  return kind === "subscription"
    ? allowedSubscriptionTransitions(
        from as SubscriptionStatus,
        context as SubscriptionTransitionContext,
      ).includes(to as SubscriptionStatus)
    : allowedInvoiceTransitions(
        from as InvoiceStatus,
        context as InvoiceTransitionContext,
      ).includes(to as InvoiceStatus);
}

export function assertSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  context: SubscriptionTransitionContext,
): void {
  invariant(
    canTransition("subscription", from, to, context),
    "INVALID_TRANSITION",
    `Cannot transition subscription from ${from} to ${to}`,
  );
}

export interface TransitionScheduleContext extends SubscriptionTransitionContext {
  nextInvoiceDate: DateOnly;
  billingAnchorDay: number;
  billingAnchorMonth: number;
  /** Latest issued period end, including an invoice still awaiting payment. */
  lastInvoicePeriodEnd: DateOnly | null;
}

/**
 * A calls this while holding the subscription lock, then persists the result + event.
 * Pausing/closing cannot discard a billable active-period backlog. After resumption,
 * waived gaps are never caught up; existing invoice coverage is never charged twice.
 */
export function planSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
  context: TransitionScheduleContext,
) {
  assertSubscriptionTransition(from, to, context);
  parseDate(context.nextInvoiceDate);
  if (context.lastInvoicePeriodEnd) parseDate(context.lastInvoicePeriodEnd);
  if (from === "ACTIVE" && (to === "PAUSED" || to === "CLOSED")) {
    const lastBillableDate =
      context.expiryDate && context.expiryDate < context.today
        ? context.expiryDate
        : context.today;
    invariant(
      context.nextInvoiceDate > lastBillableDate,
      "BILLING_BACKLOG",
      "Run billing for the active service periods before pausing or closing",
    );
  }
  const restarting =
    to === "ACTIVE" && (from === "PAUSED" || from === "CLOSED");
  const nextInvoiceDate = restarting
    ? context.lastInvoicePeriodEnd &&
      context.lastInvoicePeriodEnd > context.today
      ? context.lastInvoicePeriodEnd
      : context.today
    : context.nextInvoiceDate;
  const anchor = restarting
    ? anchorFor(nextInvoiceDate)
    : { day: context.billingAnchorDay, month: context.billingAnchorMonth };
  const expiryDate =
    from === "CLOSED" && to === "ACTIVE"
      ? context.renewalExpiryDate!
      : (context.expiryDate ?? null);
  invariant(
    !expiryDate || nextInvoiceDate <= expiryDate || !restarting,
    "INVALID_RENEWAL",
    "The renewed term ends before its first billable date",
  );
  return {
    status: to,
    nextInvoiceDate,
    billingAnchorDay: anchor.day,
    billingAnchorMonth: anchor.month,
    expiryDate,
  };
}

/** A's published confirm/cancel permission interface; payment-driven states use the full amount-aware helpers. */
export function canTransitionInvoice(
  from: InvoiceStatus,
  to: InvoiceStatus,
  context: { paymentCount: number },
): { ok: true } | { ok: false; reason: string } {
  invariant(
    Number.isSafeInteger(context.paymentCount) && context.paymentCount >= 0,
    "INVALID_INVOICE_STATE",
    "Payment count is invalid",
  );
  if (from === to) return { ok: false, reason: `Invoice is already ${from}` };
  if (from === "PAID" || from === "CANCELLED")
    return { ok: false, reason: `A ${from} invoice cannot change status` };
  if (
    (from === "DRAFT" && (to === "CONFIRMED" || to === "CANCELLED")) ||
    (from === "CONFIRMED" && to === "CANCELLED")
  ) {
    return context.paymentCount === 0
      ? { ok: true }
      : {
          ok: false,
          reason:
            "An invoice with payments cannot change through an administrative action",
        };
  }
  return { ok: false, reason: `Cannot move an invoice from ${from} to ${to}` };
}
