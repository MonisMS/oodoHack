# Monis (B) — implementation and integration handoff

Completed and verified on 31 October 2026. Before final integration, main was fetched and fast-forwarded to teammate commit `e6e43f0`. The latest authentication, subscription, invoice/payment and security services were preserved and integrated with B's financial policy. Publication follows the user's explicit commit/push request.

## Delivered behavior

- Exact integer-paise parsing, checked arithmetic with bigint intermediates, half-up tax/percentage rounding, deterministic largest-remainder allocation and effective variant pricing.
- UTC daily/weekly/monthly/yearly periods with preserved month/leap-day anchors, inclusive expiry, exclusive period ends and bounded catch-up.
- Explicit subscription/invoice state machines, plan-flag checks, and a pure transition schedule planner integrated into A's locked subscription service.
- Pure invoice calculation with product best-of promotions, one FIXED budget per invoice, ordered subscription discounts, discounts before tax, frozen tax/allocation snapshots and separate negative lines.
- Real POST `/api/billing/run` behind the existing ADMIN/STAFF guards. No development identity shortcut was added to production auth.
- One Serializable transaction per subscription batch: row locks, deterministic discount locking, conditional usage reservation, counter numbering, invoice/line/usage writes and cursor advance. Failures roll back the entire subscription batch and do not stop healthy candidates.
- Invoice-period uniqueness, bounded deadlock/serialization retries, stale/overlapping-cursor rejection, last-redemption race protection and auto-close after all valid periods are billed. Paused gaps are not invoiced.
- Opt-in daily UTC node-cron job calling the same service; bounded draining, failed-record exclusion, no-progress detection and graceful shutdown.

## User-approved financial decisions

1. **Discounts reduce the taxable base.** ₹1,000 less ₹100, at an illustrative 18%, gives ₹162 tax and ₹1,062 due. Tax rates themselves remain configured data, not a hard-coded rate assumption.
2. **One fixed-discount budget per invoice.** Splitting a product into multiple rows cannot multiply that rule's fixed value. Product promotions remain best-of per line, with a shared fixed budget; selection is deterministic by saving, rule ID and line position.
3. **No charges for paused/closed gaps.** Resume/renew starts a fresh schedule after any already-generated invoice coverage. Existing invoices remain immutable; this does not create prorated refunds or rewrite old invoices.

API_CONTRACT.md and the optional TaxSnapshot audit fields were synchronized with these decisions. No Prisma schema/migration or dependency change was needed after the teammate update.

## Public exports and ownership

All pure exports are available from `server/src/lib/domain/index.ts`; individual module imports are also supported. None of the domain files imports Prisma, Express, networking or a system clock.

| File | Public exports / purpose |
|---|---|
| domain/money.ts | toMinor, fromMinor, addMinor, lineSubtotal, computeLineTax, allocateMinor; range and ratio helpers |
| domain/price.ts | resolveUnitPrice, priceLine; explicit overrides are already final prices |
| domain/period.ts | parseDate, dateOnly, addDays, anchorFor, nextBillingDate, billingPeriods |
| domain/discount.ts | DiscountRule, findApplicableDiscounts, eligibleForBasis, discountSaving |
| domain/invoice-draft.ts | buildInvoiceDraft; charge/rate/draft/snapshot interfaces |
| domain/states.ts | allowedTransitions, canTransition, per-entity variants, assertSubscriptionTransition, planSubscriptionTransition |
| billing-engine/service.ts | runBilling; createBillingService for isolated clients and configurable run limits |
| billing-engine/retry.ts | nested Prisma/pg conflict classification and bounded whole-transaction retry |
| jobs/billing.ts | runBillingCycle, startBillingScheduler; importing does not start a timer |

Server module imports use `.js` suffixes for Node ESM. Monetary DTOs use two-place decimal strings, including negative adjustment values internally; JSON never carries bigint or floating point money.

## Integrated subscription transition service

A owns the subscription mutation endpoint, authorization and history persistence. The current service now calls B's exported planner under its existing row lock and persists schedule, status and history in one transaction. A's public rules interface delegates to B's policy; invoice administration also delegates to B's canonical transition adapter. The implemented flow is:

```ts
// Inside A's transaction, after locking and loading the subscription:
const coverage = await tx.invoice.aggregate({
  where: { subscriptionId: sub.id },
  _max: { periodEnd: true },
});
const change = planSubscriptionTransition(sub.status, input.to, {
  today: dateOnly(new Date()),
  expiryDate: sub.expiryDate ? dateOnly(sub.expiryDate) : null,
  renewalExpiryDate: input.renewalExpiryDate,
  plan: sub.plan,
  nextInvoiceDate: dateOnly(sub.nextInvoiceDate),
  billingAnchorDay: sub.billingAnchorDay,
  billingAnchorMonth: sub.billingAnchorMonth,
  lastInvoicePeriodEnd: coverage._max.periodEnd
    ? dateOnly(coverage._max.periodEnd)
    : null,
});
// Persist change.status, parsed change.nextInvoiceDate/expiryDate and anchors,
// plus the from/to/actor history event, using this same tx.
```

The coverage lookup considers generated invoice periods, including unpaid drafts, because their period keys are already reserved and they must not be billed twice. Cancelling an invoice does not automatically reissue it or refund discount usage. If cancellation/rebilling semantics change, A/B must design that explicitly.

Before ACTIVE→PAUSED/CLOSED, the planner returns **409 BILLING_BACKLOG** if active service has due unbilled periods. Run billing first and retry the transition. This guard concerns **unbilled periods**, not whether an already-issued invoice is paid; unpaid issued invoices remain collectible. On resume/renew, nextInvoiceDate is `max(today, latest generated periodEnd)`, with day/month anchors reset to that date.

The engine also blocks stale/overlapping resume cursors with SCHEDULE_RECONCILIATION_REQUIRED. It will not auto-close an incorrectly paused record if history exposes unpaid-for active service before the pause. These guards make integration mistakes visible instead of silently creating wrong charges or deleting debt. Domain errors map through the shared error envelope; invalid transitions/backlog/reconciliation return 409.

## Billing limits and operational semantics

- API input remains `{asOfDate,maxPeriodsPerSubscription?}`, default 24 periods, max 120. asOfDate is a UTC date; unsupported calendar years are rejected before SQL.
- Default run reads at most 100 subscriptions, with a 25-second soft run budget checked between transactions. Each transaction has bounded wait/time and at most three attempts. A transaction in progress finishes or rolls back; the soft budget never creates a partial financial write.
- `createBillingService` accepts internal limits and a pure calculation dependency for tests; these are not untrusted HTTP options.
- hasMore reports valid remaining work excluding subscriptions explicitly failed during that run. Failures are returned separately and retried by a new independent run. The scheduler carries failed IDs between its batches to prevent starvation.
- Cron has a maximum of 10 batches and a 30-second soft cycle budget; a currently running service/transaction can extend that soft budget. It stops on no progress and logs safe result metadata.
- Keep `BILLING_CRON_ENABLED=false` until the intended local database is migrated/configured. Set it true to start the already-wired scheduler; `BILLING_CRON` defaults to `0 0 * * *` in UTC (05:30 IST). Manual runs use the same financial engine.
- Scheduler shutdown waits for the active cycle before Prisma disconnects. No emails, HTTP gateway calls or irreversible external effects occur inside retryable billing transactions.
- Current configured rates/plan fees are captured when creating a new invoice. Existing subscription unit prices and generated invoice snapshots stay frozen. This implementation does not reconstruct historical effective-dated tax/plan versions, add GST registration/place-of-supply models or implement bank AutoPay.
- The current schema does not persist per-line discount allocations on untaxed lines; the pure result exposes them, and taxed lines freeze them inside their tax snapshots. If later reporting needs a normalized audit of all line allocations, A should add an explicit model/column rather than infer current rules.

## Verification performed

| Check | Actual result |
|---|---|
| Existing migrations | Both foundation and Better Auth migrations applied successfully to isolated local PostgreSQL 18.6 |
| Full tests, with all DB suites enabled | **150 passed, 0 skipped** across 18 files, including 16 PostgreSQL billing scenarios, teammate auth/subscription/invoice/security tests and the complete A/B HTTP financial flow |
| TypeScript | Client + server + tests passed |
| Production build | Server TS output and Vite bundle passed |
| Prisma schema validation | Passed; no schema change in this workstream |
| npm audit | Zero vulnerabilities reported |
| Compiled-server smoke | Scheduler-enabled startup, health, real staff billing request, customer 403 and year-zero 422 passed |
| Graceful shutdown | Scheduler, HTTP server and Prisma stopped cleanly |

Race tests deliberately held database row locks until two independent transactions were observed waiting. They then released the barrier and checked the resulting invoices, cursor and rule usage. This proves more than calling Promise.all without ensuring overlap. A later-period injected failure proved that earlier invoice/usage/counter writes all roll back together.

Three disposable test databases isolated the teammate API suites, billing race tests and complete HTTP financial flow. All were separate from application data, bound to loopback on a separate port, and used only generated fixture IDs. Its runner was installed under ignored node_modules cache, not added to project manifests. The test runner is stopped after verification.

Observed non-failing dependency diagnostics: Prisma's pg adapter emits a pg-8 query-queue deprecation warning during integration tests (trace leads into the adapter/runtime; application transaction statements are awaited). The frontend build reports its existing large shared chunk after Better Auth integration. Neither prevented the above checks; do not upgrade pinned dependencies or change C/D's UI architecture as an unreviewed workaround.

## Re-running verification

Use three disposable **local** databases with names containing `test`. Never point the test environment at shared/demo/real financial data. Keep the API fixtures separate from the billing race suite and full HTTP flow so their workers cannot invoice each other's subscriptions. After creating these databases:

```bash
cd /home/monis/oodoHack
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_app_test'
export BILLING_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_billing_test'
export BILLING_FLOW_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_flow_test'
DATABASE_URL="$TEST_DATABASE_URL" npm run db:deploy
DATABASE_URL="$BILLING_TEST_DATABASE_URL" npm run db:deploy
DATABASE_URL="$BILLING_FLOW_TEST_DATABASE_URL" npm run db:deploy
DATABASE_URL="$TEST_DATABASE_URL" npm test
npm run typecheck
npm run build
```

The billing suites reject non-loopback/non-test database names. Plain `npm test` skips DB integration when the variables are missing; do not mistake such a run for the full verification above.

A's subscription/invoice/payment services are integrated and exercised end to end. Other workstreams retain catalog/admin screens, feature UI, reports, seed/demo data and production delivery. Completing B does not complete the whole application.
