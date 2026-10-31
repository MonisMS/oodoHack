# Follow-ups for B (Monis) — found by adversarial testing of `main`

Owner of this file: A. Everything below touches B-owned code (`lib/domain/**`, `modules/billing-engine/**`, `jobs/billing.ts`), so A did **not** change it. All of A's own fixes are in `feat/A-10-safety-hardening` and `feat/A-11-subscription-lifecycle`; with both applied the full suite is green (178 passed, 1 todo) including your three database suites.

Your billing/domain work held up well: 150/150 of your tests passed on a separate machine, and billing one period for 3 subscriptions took 79 ms with 5,000 subscriptions / 15,000 invoices in the database (every list endpoint answered in under 80 ms).

## 1. CRITICAL — billing accepts a future `asOfDate`
`POST /api/billing/run {"asOfDate":"2036-01-01","maxPeriodsPerSubscription":120}` created **567 invoices in one call** (111 for a single subscription, all issued in 2036). Any staff member with a typo can do this, and the invoices are immutable.
**Fix:** reject `asOfDate` later than the business date. `todayBusiness()` is in `server/src/lib/dates.ts` (A-10; business calendar = `BUSINESS_TZ`, default Asia/Kolkata, so IST staff can bill "today" after midnight IST). Either a controller check returning `422 VALIDATION_ERROR` with `fields.asOfDate`, or a refinement on the HTTP-level schema (do not change `billingInput` itself unless your service tests use future dates). Add a test: a future date must create 0 invoices and return 422. Cron's UTC date is never ahead of the IST date, so the scheduler is unaffected.

## 2. Pause / close / cancel are blocked while billing is due (BILLING_BACKLOG 409)
Real systems let staff end or pause a subscription at any time and bill what is owed. Today a subscription with due periods cannot be paused or closed until billing succeeds, so one failing subscription can never be cancelled, and the UI is told the buttons are allowed.
**Request:** export `billSubscription(subscriptionId: string, asOfDate: string): Promise<{ created: number }>` — your `processSubscription` for ONE subscription (same transaction/retry rules). A will call it before pausing/closing an ACTIVE subscription, so the planner's backlog check then passes (A's `schedule-cancellation` and `change-lines` already reject with BILLING_BACKLOG and will use it too). Call it outside A's own row lock; A will do that.

## 3. Billing must use the locked plan price
A-11 adds `Subscription.planPrice` (Decimal?, backfilled for existing rows; set on create/edit, re-priced on renewal) so changing a plan's price no longer reprices running subscriptions (Chargebee/Recurly "grandfathering"). Verified before the change: plan fee 10 → 99 changed the next invoice of an existing subscription.
**Fix:** in `subscriptionSelect` add `planPrice: true` and charge `sub.planPrice ?? sub.plan.price` for the plan-fee line. Test: change the plan price between two billing runs → second invoice keeps the old fee; after close+renew it uses the new fee.

## 4. BUG in `planSubscriptionTransition` — resume/renew of a not-yet-started subscription returns HTTP 500
`nextInvoiceDate = max(today, lastInvoicePeriodEnd)` can be before `startDate` when the start date is in the future; the database CHECK `nextInvoiceDate >= startDate` then fails. Repro: create a subscription with `startDate` in 10 days, activate, close (plan `closableEarly`), renew with a future `renewalExpiryDate`. There is an `it.todo` for it in `tests/subscriptions/subscriptions.test.ts`.
**Fix:** add `startDate` to `TransitionScheduleContext` and use `max(today, startDate, lastInvoicePeriodEnd)` (also validate `anchor` from that date). A will pass `startDate` from `subscriptions/service.ts` as soon as the context field exists (one line).

## 5. A cancelled invoice leaves its period unbilled forever (your doc already marks this as open)
`unique(subscriptionId, periodStart)` also covers CANCELLED invoices, so cancelling a wrongly generated invoice means that period can never be billed (violates "nothing skipped"); Stripe's model is void + issue a new invoice (or credit note).
**Recommendation (smallest safe design):** allow `CANCELLED → DRAFT` ("reopen") in `domain/states.ts` for an invoice with no payments whose period has not been re-covered, and A exposes `POST /api/invoices/:id/reopen`. If you prefer true re-issue with recalculation, that needs a partial unique index excluding CANCELLED plus coverage logic that ignores cancelled invoices — A can do the migration once you decide. Please tell A which.

## 6. Smaller items
- Billing does not check `customer.isActive`. A now refuses to deactivate a customer who has ACTIVE/PAUSED subscriptions, so this cannot happen through the API; optionally fail with `INVALID_CUSTOMER` as defence in depth.
- Optional `autoConfirm` flag for billing runs. A added bulk `POST /api/invoices/confirm|send|remind` (up to 100 ids, per-invoice results) so hundreds of billing-day invoices need not be confirmed one by one; `autoConfirm` is only a convenience.
- Observed, not a failure: `pg` 8 query-queue deprecation warning in billing tests.

## What changed around you (so nothing surprises you)
- `lib/dates.ts`: `todayBusiness()`; A's services now use the business date for payment/overdue/pause decisions. `planSubscriptionTransition` is still called with `today` (A passes the business date).
- New env vars: `HOST` (default `127.0.0.1`), `TRUST_PROXY`, `BUSINESS_TZ`. `DEV_AUTH_ENABLED` defaults to false and only works from this machine.
- Subscription start dates must be within [today − 2 years, today + 5 years], expiry within 20 years of start; line totals are capped (1,000,000,000.00 each, 10,000,000,000.00 per subscription) so billing can always store them.
- Schema: `Subscription.planPrice`, `cancelScheduledAt`, `expiryBeforeCancellation`; `Invoice.lastReminderAt`, `reminderCount` (migration `20261031130000_subscription_lifecycle`, additive).
- Cancel at period end moves `expiryDate` to the last invoiced day; your billing predicate then stops invoicing and your auto-close closes it (tested end to end with your engine).
