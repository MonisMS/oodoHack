# Monis (B) status — implementation complete locally

Updated 31 October 2026. Latest teammate main was fetched and fast-forwarded to d9f4718 (A-10/A-11) before the follow-up fixes. Authentication, subscription, invoice/payment and security work was retained. Publication is authorized by the user.

## Completed

- B-01: published typed public interfaces and policy/integration handoff in docs/B_IMPLEMENTATION.md.
- B-02/B-03: exact paise/rounding/allocation/price helpers and anchored UTC calendar periods.
- B-04/B-05: deterministic invoice-time discount/tax calculator and subscription/invoice state machines with a pause/renew schedule planner.
- B-06: transaction-per-subscription billing, locking/usage/counters/immutable snapshots/cursor, bounded retries/scans/time, expiry closure, financial integrity guards and real database concurrency/rollback tests.
- B-07: real ADMIN/STAFF billing endpoint; opt-in UTC cron wired into startup with bounded draining and graceful shutdown.
- B-08: this status, docs/B_IMPLEMENTATION.md and the updated contract/DTO integration notes.

## User decisions applied

Discounts reduce taxable bases before tax; FIXED rule value is one budget per invoice; paused/closed gaps are uncharged. Already-generated periods are preserved. Active-service backlog must be invoiced before pause/close, not discarded. Current configured tax/plan values are used for newly created invoices; historical rate versions and complete GST/AutoPay features remain outside this schema's scope.

## Verified

- Full database-enabled suite: 196 passed, 0 skipped/todo across 19 files, including 21 PostgreSQL billing scenarios and the complete template → activation → discounted billing → partial/full payment → pause/renew HTTP flow.
- PostgreSQL row-lock barriers prove actual concurrent overlap for duplicate billing and the last discount redemption.
- Later-period fault rolls back invoice lines, invoices, usage, numbering and cursor together.
- Client/server typecheck, production build, Prisma validation pass; npm audit reports 0 vulnerabilities.
- All three committed migrations applied successfully to an isolated local PostgreSQL 18.6 test instance.
- Compiled API smoke with scheduler enabled: health 200, staff billing 200, customer 403, invalid calendar 422; graceful shutdown passed.

## Integration handoff / material boundaries

A's transition service now calls planSubscriptionTransition under its row lock and atomically persists schedule/status/history. Subscription and invoice administrative rule adapters delegate to B's canonical state policy. The merged regression suite verifies backlog rejection and pause/renew without duplicate charges. UI remains assigned to C/D; the engine rejects incorrect stale/overlapping schedules and debt-dropping paused closure.

Shared edits cover opt-in job startup/env/shutdown, domain error mapping, optional snapshot audit DTO fields, corresponding contract documentation, the billing foundation assertion, and integration adapters/planner calls in A's subscription/invoice services and regression tests. Follow-ups: future HTTP dates rejected by business date; targeted billSubscription exported and wired into lifecycle actions; locked plan prices charged; future starts preserved on resume/renew; guarded CANCELLED→DRAFT reopen endpoint; active-customer defense and business-date history checks. See docs/B_FOLLOWUPS_RESOLVED.md. Schema, migrations and dependency manifests were not changed after pulling main. See docs/B_IMPLEMENTATION.md for public exports, commands, limits and non-failing dependency diagnostics.
