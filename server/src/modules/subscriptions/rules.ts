import type { SubscriptionStatus } from '@prisma/client';
import { canTransition as domainCanTransition, allowedSubscriptionTransitions } from '../../lib/domain/states.js';

// A's published interface is retained as a thin adapter to B's single policy source.
export type TransitionCheck = { ok: true } | { ok: false; reason: string };
export interface SubscriptionContext {
  plan: { pausable: boolean; closableEarly: boolean; renewable: boolean };
  expiryDate: string | null; today: string; renewalExpiryDate?: string | null;
}
export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus, context: SubscriptionContext, options: { requireRenewalDate?: boolean } = { requireRenewalDate: true }): TransitionCheck {
  if (options.requireRenewalDate === false && from === 'CLOSED' && to === 'ACTIVE') return context.plan.renewable ? { ok: true } : { ok: false, reason: 'This plan cannot be renewed' };
  const ctx = { ...context, renewalExpiryDate: context.renewalExpiryDate ?? undefined };
  if (domainCanTransition('subscription',from,to,ctx)) return { ok:true };
  let reason = `Cannot move a subscription from ${from} to ${to}`;
  if (from === to) reason = `Subscription is already ${from}`;
  else if (from === 'CLOSED' && to === 'ACTIVE') {
    if (!context.plan.renewable) reason = 'This plan cannot be renewed';
    else if (!context.renewalExpiryDate) reason = 'renewalExpiryDate is required to renew';
    else reason = 'renewalExpiryDate must be later than today and the previous expiry date';
  }
  return { ok:false, reason };
}
export function allowedTransitions(from: SubscriptionStatus, context: SubscriptionContext): SubscriptionStatus[] {
  if (from === 'CLOSED' && context.plan.renewable) return ['ACTIVE']; // offer the renewal form; mutation still validates its date
  return allowedSubscriptionTransitions(from,{...context,renewalExpiryDate:context.renewalExpiryDate ?? undefined});
}
export const needsRevalidation = (from: SubscriptionStatus, to: SubscriptionStatus) =>
  ({ DRAFT:'QUOTATION',QUOTATION:'CONFIRMED',CONFIRMED:'ACTIVE' } as Partial<Record<SubscriptionStatus,SubscriptionStatus>>)[from] === to;
