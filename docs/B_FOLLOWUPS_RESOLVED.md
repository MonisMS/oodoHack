# B follow-up resolutions — 31 October 2026

Base: main fast-forwarded to `d9f4718`, including A-10 and A-11. The original A-owned `docs/B_FOLLOWUPS.md` is retained as the report. All five requested issues are fixed, with the connected backend integrations completed.

## 1. Future billing date

POST /api/billing/run rejects dates after `todayBusiness()` before calling the billing service: HTTP 422 VALIDATION_ERROR with fields.asOfDate. Tests cover the 2036/120-period reproduction (zero invoices), tomorrow, and after-midnight IST when UTC is yesterday. Internal `runBilling` still accepts simulated dates for tests. The targeted production settlement helper also rejects future dates.

## 2. Single-subscription settlement and lifecycle

`billSubscription(subscriptionId, asOfDate): Promise<{created:number}>` is exported from billing-engine/service.ts and from `createBillingService(client)` for isolated clients. It uses the same subscription lock, Serializable transaction, discount locks, snapshots, numbering, cursor updates and bounded retries as batch billing. It targets only the supplied UUID; no all-subscription scan/exclusion list is needed.

It drains batches of up to 120 periods, bounded by 32 batches and the service's 25-second default soft budget. It returns successfully only when no eligible due periods remain for that subscription. At a limit/no progress it throws BILLING_BACKLOG; earlier completed batches remain committed and idempotent, while a failing batch rolls back entirely. It never changes lifecycle status or auto-closes, allowing the caller to perform its own validated transition.

Pause, close, scheduled cancellation and line changes now use it. Their first locked transaction validates the action and rolls back on BILLING_BACKLOG. Settlement then runs outside that transaction, and a second locked transaction rechecks every guard before applying the mutation/history. Invalid transitions and invalid line changes cannot trigger invoicing. Due seat charges use the old lines. Competing operations can produce an ordinary conflict on revalidation; they cannot discard due service or create duplicate invoices. Genuine billing configuration errors still require reconciliation and propagate without changing lifecycle state.

## 3. Locked plan fee

The billing selection includes planPrice; the plan charge uses `sub.planPrice ?? sub.plan.price`. Zero is a real locked price. Regression tests change the catalog between periods, verify legacy null fallback, and exercise API close/renew repricing while preserving the old invoice.

## 4. Future starts and business dates

TransitionScheduleContext now requires startDate. Resume/renew selects max(today, startDate, lastInvoicePeriodEnd), validates dates and resets anchors from that result. The subscription caller passes startDate. The A-11 todo is now an HTTP regression covering future activation/pause/resume/close/renew with no early invoices. A new term ending before its first billable date is rejected as a domain validation error. Billing's event-history safeguards also compare event dates on the business calendar, matching A's lifecycle decisions.

## 5. Guarded reopen, preserving the original invoice

POST /api/invoices/:id/reopen is ADMIN/STAFF-only. It locks Subscription then Invoice and permits CANCELLED→DRAFT only with zero collected money, no payment records, and no overlapping non-cancelled invoice for that subscription. The pure state interfaces require explicit `periodUncovered:true`; omitting the verification fails closed. Reopen retains the original invoice ID/number, dates, frozen amounts/lines/tax/customer snapshots, send/reminder history and discount usage. It never increments counters/discount usage, rewinds the cursor or creates a second period invoice. It can then be confirmed and collected normally.

This is the requested small administrative restoration design. Stripe's [invoice-state documentation](https://support.stripe.com/questions/invoice-states?locale=en-GB) treats its own void status as terminal; our reversible local CANCELLED status is not a claim that an externally voided/statutory invoice can be undone. Correcting/recalculating amounts or full reissue remains a separate accounting/schema feature. No partial unique index or coverage exclusion migration was introduced.

Tests cover exact snapshot/usage preservation, payment protection, roles, invalid IDs/states, adjacent periods, overlapping live coverage, two simultaneous reopen attempts, and two overlapping cancelled invoices competing to reopen.

## Connected hardening and verification

- Billing rejects inactive customers as INVALID_CUSTOMER, including targeted settlement; no financial rows are written.
- Existing auth/origin/rate-limit and payment guards are retained. Reopen is included in the contract-driven role suite.
- Database-enabled suite: **196 passed, zero skipped/todo**, 19 files. Includes real PostgreSQL row-lock races, 130-period daily settlement, rollback fault injection and the complete subscription/billing/reopen/payment flow.
- Client/server TypeScript, production build and Prisma schema validation passed. The compiled API smoke passed scheduler-enabled startup, health, staff billing, customer rejection, calendar validation, the 2036 future-date guard and graceful shutdown. Existing large-client-chunk and pg-adapter deprecation diagnostics remain non-failing.
- All three existing migrations applied only to three isolated local test databases. No application database, schema, migration, dependency manifest or lockfile changes were required.

The optional autoConfirm flag was not added; existing explicit confirmation and A's bulk confirmation remain the supported workflow.

Changes were verified locally; the user authorized committing and pushing these fixes to main.
