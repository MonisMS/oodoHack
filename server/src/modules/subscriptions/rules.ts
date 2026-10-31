import type { SubscriptionStatus } from '@prisma/client';

// STAND-IN for B's lib/domain/states.ts (B-05). It encodes exactly the transition table in API_CONTRACT.md
// and exposes the signature proposed in docs/A-01-agreements.md, so switching to B's export is a one-line import change.
export type TransitionCheck = { ok: true } | { ok: false; reason: string };
export interface SubscriptionContext {
  plan: { pausable: boolean; closableEarly: boolean; renewable: boolean };
  expiryDate: string | null; today: string; renewalExpiryDate?: string | null;
}
const ALL: SubscriptionStatus[] = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED'];
const FORWARD: Partial<Record<SubscriptionStatus, SubscriptionStatus>> = { DRAFT: 'QUOTATION', QUOTATION: 'CONFIRMED', CONFIRMED: 'ACTIVE' };
const no = (reason: string): TransitionCheck => ({ ok: false, reason });
const ok: TransitionCheck = { ok: true };

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus, ctx: SubscriptionContext, opts: { requireRenewalDate?: boolean } = { requireRenewalDate: true }): TransitionCheck {
  if (from === to) return no(`Subscription is already ${from}`);
  if (FORWARD[from] === to) return ok;
  if (to === 'CLOSED') {
    if (from === 'DRAFT' || from === 'QUOTATION' || from === 'CONFIRMED') return ok;
    if (from === 'ACTIVE' || from === 'PAUSED') {
      const expired = ctx.expiryDate !== null && ctx.expiryDate < ctx.today;
      return expired || ctx.plan.closableEarly ? ok : no('This plan does not allow closing before the expiry date');
    }
  }
  if (from === 'ACTIVE' && to === 'PAUSED') return ctx.plan.pausable ? ok : no('This plan cannot be paused');
  if (from === 'PAUSED' && to === 'ACTIVE') {
    if (!ctx.plan.pausable) return no('This plan cannot be paused or resumed');
    return ctx.expiryDate === null || ctx.expiryDate >= ctx.today ? ok : no('The subscription has expired; renew it instead of resuming');
  }
  if (from === 'CLOSED' && to === 'ACTIVE') {
    if (!ctx.plan.renewable) return no('This plan cannot be renewed');
    if (opts.requireRenewalDate === false) return ok;
    const next = ctx.renewalExpiryDate;
    if (!next) return no('renewalExpiryDate is required to renew');
    if (next <= ctx.today || (ctx.expiryDate !== null && next <= ctx.expiryDate)) return no('renewalExpiryDate must be later than today and the previous expiry date');
    return ok;
  }
  return no(`Cannot move a subscription from ${from} to ${to}`);
}

/** Statuses the UI may offer. Renewal is listed when the plan allows it; the UI then asks for renewalExpiryDate. */
export function allowedTransitions(from: SubscriptionStatus, ctx: SubscriptionContext): SubscriptionStatus[] {
  return ALL.filter(to => canTransition(from, to, ctx, { requireRenewalDate: false }).ok);
}

// Moving forward requires re-validating lines, customer and plan availability.
export const needsRevalidation = (from: SubscriptionStatus, to: SubscriptionStatus) => FORWARD[from] === to;
