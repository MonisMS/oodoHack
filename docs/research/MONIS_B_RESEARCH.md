# Monis workstream B — India-focused billing implementation research

Implementation update: the user subsequently approved pre-tax discounts, one FIXED budget per invoice and uncharged paused/closed gaps. B is now implemented on teammate main 5815e69; see ../B_IMPLEMENTATION.md for exact interfaces, retained limitations and 99 passing tests. The research below is the original pre-implementation evidence, not the current implementation status.

Research date: **31 October 2026, IST**. Repository reviewed: `/home/monis/oodoHack`, commit `8686292ea58dadaa8e1a8ec968bb749ab5a90aad`. Scope: B-01–B-08 in TASKS.md. Status: **research complete; implementation has not started**.

This document separates **published behavior**, **our engineering recommendations**, and **decisions that would change the frozen contract**. Research does not authorize a silent schema, API or financial-policy change. The lead (A) and Monis (B) retain those decisions.

## What the research changes about our understanding

The existing foundation is a workable starting point for recurring invoices. Indian payment products also have separate mandate, debit-attempt and payment-reconciliation lifecycles; building our invoice scheduler does not implement UPI AutoPay. The strongest immediate improvement is to settle tax/discount semantics before writing invoice-draft code.

| Finding | Consequence for our implementation |
|---|---|
| Razorpay represents plan amounts in currency subunits; PostgreSQL distinguishes exact numeric from inexact float types. | Keep decimal strings at API boundaries and exact integer-paise arithmetic internally. |
| Chargebee retains an original monthly billing day across shorter months. | Preserve the billing anchor; never turn a February clamp into a permanent 28th-day renewal. |
| Chargebee applies coupons before tax. India's GST treatment distinguishes invoice-time discounts and later adjustments. | The foundation's generic post-tax rebate convention needs an explicit A/B decision before claiming India-style invoice tax calculations. |
| Zoho exposes pause, resume and proration as configurable business behavior. | Our paused-period catch-up and closed-period renewal charges are product choices, not universal industry behavior. |
| ERPNext has visible period and invoice-generation code; Razorpay/Cashfree document duplicate delivery and payment states. | Use source-visible examples for structure; enforce our own invoice-period uniqueness and transaction invariants. |

Evidence and links for each finding appear in the batch sections below. These observations do **not** reveal the private databases, locks or programming languages of closed-source providers.

## Research batches and coverage

| Batch | B tasks covered | Questions researched | Status |
|---|---|---|---|
| 1. Money, taxes and frozen invoices | B-01, B-02, part of B-04 | Paise, rounding, limits, GST invoice data, discount/tax base, historical rates | Complete; tax-policy decision identified |
| 2. Dates, states and lifecycle | B-03, B-05 | Anchors, leap years, expiry, pause/resume, renewal, invoice vs payment status | Complete; lifecycle choices identified |
| 3. Discount and invoice-draft calculation | B-04 | Scope, eligibility, ordering, usage budgets, mixed tax rates, deterministic totals | Complete; fixed-budget ambiguity identified |
| 4. Billing transactions and recovery | B-06 | Unique periods, locks, rollback, retries, discount races, counters, bounded catch-up | Complete; database proof remains an implementation task |
| 5. Scheduler, India payment boundaries and handoff | B-07, B-08 | Cron overlap, cutoff timezone, AutoPay boundaries, rollout, observability, acceptance | Complete; integration handoff specified |

## Systems examined and evidence limits

| System | Why it matters here | What was actually inspected |
|---|---|---|
| Razorpay | India recurring-payment API and lifecycle | Official plans, subscription states, workflow and webhook documentation |
| Cashfree | India mandate/payment collection and duplicate handling | Official subscription overview and webhook-idempotency documentation |
| Zoho Billing, India edition | Indian tax configuration plus subscription operations | Official India GST, coupons, pause/resume and proration help |
| Chargebee | Subscription billing and India GST presentation | Official calendar-billing, coupon ordering and invoice tax-snapshot help |
| ERPNext/Frappe | Publicly inspectable implementation of recurring invoices | Official user docs and `version-15` subscription Python source |
| Odoo | Evaluator-relevant recurring billing design | Versioned 18.0 scheduled-action and 19.0 automatic-payment documentation |
| CBIC and RBI | Indian tax/payment rules relevant to design boundaries | Official publications/portals; access and currency limitations recorded below |
| PostgreSQL, Prisma, node-cron | Our actual implementation mechanisms | PostgreSQL 16 docs, Prisma **v7** transaction docs, node-cron options and versioned source |

We did not interview providers, access private production code, run their paid products, benchmark them or audit an entire ERPNext installation. Public feature documentation supports a behavior comparison, not a claim that every Indian company uses the same implementation. The ERPNext branch is mutable and was inspected on the research date; pin a commit if we later base a detailed code review on it. No ERPNext source was copied into our repository.

## Batch 1 — money, taxes and frozen invoices

### What providers and authoritative sources show

Razorpay's plan API uses integer amount fields and specifies currency subunits; for INR this is paise. Its plan model also separates billing period from interval. This is an API contract, not proof of its internal database representation. [Razorpay Create a Plan](https://razorpay.com/docs/api/payments/subscriptions/create-plan/)

PostgreSQL documents `numeric`/`decimal` as exact types and `real`/`double precision` as inexact. Our existing `Decimal(14,2)` columns fit that distinction. [PostgreSQL 16 numeric types](https://www.postgresql.org/docs/16/datatype-numeric.html)

Zoho's India edition models GSTIN, tax registration, product tax rates, tax groups and place-of-supply information. It also documents tax-rate updates affecting active subscriptions. This is materially richer than our current generic Tax(name, percentage) model. [Zoho Billing India GST](https://www.zoho.com/in/billing/help/settings/compliance/taxes.html)

Chargebee documents keeping existing invoice tax breakups unchanged when a customer's address changes; new details affect future invoices. This supports treating an issued invoice as historical financial data rather than a live view of customer settings. Do not generalize every tax-applicability statement on that product help page into Indian law. [Chargebee invoice GST breakup](https://www.chargebee.com/docs/billing/2.0/kb/billing/how-does-the-tax-breakup-look-for-sgst-and-cgst-in-invoices)

### Recommended implementation for our stack

Use one boundary conversion, one arithmetic model and one output serializer:

1. Accept the existing money strings, such as `"560.00"`; reject exponents, NaN, fractional paise and malformed formatting.
2. Parse digits directly to paise. Do not implement `toMinor` using `Math.round(Number(input) * 100)`.
3. Use `bigint` for intermediate multiplication/division, with half-up rounding at the explicitly agreed line/rate boundary. Existing public helpers that return number must validate safe integer inputs/outputs, convert internally, and reject overflow. This retains the contract without pretending every intermediate is safely represented by a JS number.
4. At persistence/output boundaries, convert exactly to two-place decimal strings. Do not JSON-serialize bigint and do not use Prisma Decimal `.toNumber()` for financial calculations.
5. Check **line and invoice totals**, not just unit prices, against database range. A legal maximum unit price multiplied by a legal large quantity can still overflow `Decimal(14,2)`.

For a nonnegative paise base `b` and a percentage with four decimal places encoded as integer `r`, calculate:

```text
denominator = 1,000,000
taxMinor = floor((b × r + denominator / 2) / denominator)
18.0000% → r = 180,000
```

This is our proposed exact arithmetic, not copied provider code. Handle a negative adjustment by rounding its positive magnitude then applying the sign; do not apply the positive-only formula blindly to negative integers. Tax component rounding stays per component: rounding two separate taxes is not always identical to rounding their combined rate.

Keep the foundation's effective-price rule: missing subscription unitPrice resolves from product base + variant extra **once**; an explicit unitPrice is already final. The subscription price is then frozen. A later catalog edit must not add the variant extra again or reprice old invoices.

### Tax/discount conflict requiring an A/B decision

Chargebee explicitly documents discounting before tax. CBIC Section 15(3)(a) excludes qualifying discounts given before/at supply and recorded on the invoice from taxable value. Later discounts require separate analysis; a blanket post-tax-rebate rule cannot stand in for all Indian invoice discounts. The updated CBIC portal was readable through its search index but returned 502 on direct retrieval; the before/at-supply principle was cross-checked against CBIC's published Act text. The indexed portal also displays a 2026 post-supply amendment with a commencement note: we have **not** established the applicable notification history for every later-discount case. [Chargebee coupons](https://www.chargebee.com/docs/billing/2.0/product-catalog/coupons), [CBIC Section 15](https://taxinformation.cbic.gov.in/content-page/explore-act/1000284/1000001), [CBIC Act compilation as at 1 January 2022](https://cbic-gst.gov.in/pdf/CGST-Act-2017-amended-01012022.pdf)

Our own illustrative arithmetic, using a hypothetical 18% rate:

| Model | Gross price | Discount | Tax base | Tax | Amount due |
|---|---:|---:|---:|---:|---:|
| Current frozen post-tax rebate model | ₹1,000.00 | ₹100.00 | ₹1,000.00 | ₹180.00 | ₹1,080.00 |
| Ordinary invoice discount, reducing the tax base | ₹1,000.00 | ₹100.00 | ₹900.00 | ₹162.00 | ₹1,062.00 |

Recommendation: if the goal is India-style commercial tax invoicing, revise the contract to distinguish invoice-time discounts from post-supply adjustments **before** B-04. Allocate invoice-level discounts across eligible charge lines, calculate tax on discounted bases and freeze that allocation. If retaining the simple hackathon post-tax convention, label it accurately and do not describe the result as a complete GST implementation. No contract or migration has been changed by this research.

Mixed-rate allocation must be deterministic. A proposed proportional allocation uses integer weights, floors each allocation, then assigns leftover paise by largest fractional remainder with a stable line-position tie break. Allocations must sum to the exact discount and cannot exceed each eligible base. A must decide how `taxableBase`/line discount allocations will be stored and exposed; today's TaxSnapshot DTO lacks them. Do not hide required audit data in undocumented JSON keys.

### India invoice-data and history gaps

CBIC invoice rules describe supplier/recipient details, tax values and place-of-supply information. The indexed Rule 46 text specifies numbering constraints including a financial-year-unique series and a 16-character limit. Our sample INV/calendar-year/counter is a demo numbering scheme, not a verified India fiscal-series policy. [CBIC invoice rules publication](https://cbic-gst.gov.in/gst-invoice-rules.html), [CBIC Rule 46, indexed text; direct access returned 502](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001)

Repository audit: there are no structured GSTIN/address/place-of-supply/HSN-SAC fields or credit-note model, and Tax has no effective-date versions. Those are real model gaps if production GST is the target. Fixed seed percentages are demo inputs, not evidence of the applicable rate for a particular supply. Product classification, current rates and legal applicability require separate verification; do not hard-code all software to a generic rate.

Frozen invoice snapshots protect **already generated** invoices. They do not tell us the correct historical rate for a missed period when the Tax row has since been edited. For catch-up billing, A/B must choose an explicit historical-rate policy or add effective-dated tax versions. The same distinction applies to the plan fee, which is read at billing time in the current model, while subscription line unit prices are frozen earlier.

### Batch 1 acceptance cases

- `"0.10" + "0.20"` produces exactly 30 paise; negative formatting is only accepted for internal discount lines.
- ₹0.05 at 10% rounds a half-paise tax upward to ₹0.01 under the selected line policy.
- Two individually rounded tax components retain both snapshots and reconcile with totals.
- Maximum allowed unit price × large quantity fails with a domain range error before DB writes.
- A subscription override price never gets a second variant-extra addition.
- Editing product price, tax percentage or customer data does not alter an existing invoice.
- The ₹1,000/₹100 example has one approved expected answer; tests must not accept both modes accidentally.
- A missed historical period and a tax-rate change have a documented, testable outcome.

## Batch 2 — billing dates, states, pause and renewal

### Published behavior

Chargebee calendar billing explicitly handles nonexistent monthly dates by using the month's last day and returning to the original billing date when available: January 31, February 28/29, March 31. It supports more alignment/proration choices than we need. Adopt the anchor principle, not its entire feature set. [Chargebee calendar billing](https://www.chargebee.com/docs/billing/2.0/subscriptions/calendar-billing)

Zoho does not raise renewal invoices while a subscription is paused. Its documented resume behavior can change the billing date when resuming after the next billing date, and can invoice current-cycle/unbilled charges. It also offers proration and pause-credit options. This differs from assuming every paused month will automatically be back-billed. [Zoho pause/resume](https://www.zoho.com/in/billing/help/sales/subscriptions/subscriptions.html), [Zoho proration](https://www.zoho.com/in/billing/help/settings/subscriptions/proration.html)

Razorpay distinguishes subscription activation, failed-payment retry states and halted collections; its docs describe cases where invoices keep being generated although automatic charges stop. Thus subscription status, invoice status and payment-attempt status are different concepts. Our current enum is a smaller application-specific state machine; do not copy gateway states into it indiscriminately. [Razorpay subscription states](https://razorpay.com/docs/payments/subscriptions/states/)

### Recommended domain model

Keep pure date functions independent of Prisma, Express and system time. Pass `asOfDate`/`today` explicitly. Parse date-only strings deliberately and use UTC calendar arithmetic because that is the current contract; avoid server-local setters, 30-day approximations and `new Date().toLocaleDateString()` as a persistence key.

Proposed monthly/yearly algorithm:

1. Retain original anchor day and, for yearly periods, anchor month.
2. Advance to the target calendar month/year.
3. Choose `min(anchorDay, daysInTargetMonth)`; do not use the previously clamped day as the next anchor.
4. Represent invoice periods as half-open `[start, end)` intervals; expiry remains inclusive in the current contract.
5. Bill only when periodStart <= asOfDate and periodStart <= expiryDate, if expiry exists. Clip the display/service period end to expiry+1 day, but keep the cursor at the next natural boundary.

The current full-price/no-proration rule for a clipped final period is a **contract choice**, not a calendar necessity. The research does not change it.

State helpers should be total pure functions: every from/to pair returns an explicit allowed/denied result with a reason. A owns authorization, database row locking and SubscriptionEvent persistence; B supplies the policy checks. A payment-induced invoice transition must not become an arbitrary public status-edit API.

### Pause, renewal and expiry choices

Current contract: PAUSED suppresses execution but preserves the billing cursor; resuming catches up paused periods. CLOSED→ACTIVE renewal also preserves the cursor. This can charge for a long interval when the customer believed service was paused or closed. That behavior needs clear product intent before implementation. Existing history events provide some dates, but there is no explicit waived-period/renewal-segment model.

Recommendation for the demo: choose and name one behavior. If keeping deferred billing, make it visible in the UI and test the exact catch-up. If pausing is meant to waive service charges or move the schedule, A must revise the lifecycle contract and persistence plan first. Do not accidentally obtain waived billing by overwriting nextInvoiceDate, because that loses the difference between an intentionally skipped service period and an unbilled debt.

Also decide whether expired PAUSED subscriptions auto-close without generating paused-period invoices. Today's billing selection is ACTIVE-only; an auto-close scan cannot ignore that mismatch. An ACTIVE expired subscription with backlog must catch up first, then close atomically. An autoClose=false subscription must not remain an infinite due candidate once its next period starts after expiry.

### Batch 2 acceptance cases

| Case | Expected under the existing contract unless A/B revise it |
|---|---|
| Monthly anchor 31 Jan 2026 | 28 Feb 2026, then 31 Mar 2026 |
| Monthly anchor 31 Jan 2028 | 29 Feb 2028, then 31 Mar 2028 |
| Yearly anchor 29 Feb 2024 | 28 Feb in non-leap target years; 29 Feb in 2028 |
| Weekly/daily boundaries | Exact calendar +7/+1 days across month/year boundaries |
| Period starts on expiry date | Included; final end is expiry+1 day; no proration in v1 |
| Period starts after expiry | Never billed; not counted as endlessly pending work |
| PAUSED + overdue cursor | No invoice while paused; approved resume policy determines later charges |
| CLOSED + renewal gap | Explicit decision/test; no accidental back-bill through the gap |
| All subscription/invoice from→to pairs | Exhaustive table checks plus plan flags and invalid same-state transitions |

Include expiry absent/equal/past/future, catch-up cap, invalid dates and deterministic behavior across different process timezones. Schedule tests should not depend on wall-clock timing.

## Batch 3 — discounts and invoice-draft construction

### Published behavior and differences

Zoho advanced coupons expose product/customer eligibility, validity and redemption limits; availability is plan-dependent. This supports explicit eligibility data rather than promotional logic scattered across forms. [Zoho advanced coupons](https://www.zoho.com/in/billing/help/product-catalog/coupons/advanced-coupons.html)

Chargebee documents a coupon-order sequence by item/invoice scope and fixed/percentage type. Its order differs from our product-best-of then subscription-by-UUID convention. The linked knowledge-base page contains an internally inconsistent worked arithmetic example; use its listed ordering as behavioral evidence, not its numerical example as a test oracle. Our expected totals must be independently calculated. [Chargebee coupon ordering](https://www.chargebee.com/docs/billing/2.0/kb/product-catalog/what-is-the-order-type-in-which-coupons-are-applied)

### Recommended calculation pipeline

Build one pure invoice-draft function; manual billing, cron, fixtures and preview calculations should call it rather than reproduce its arithmetic. Separate these stages:

1. Normalize plan fee and subscription product lines into immutable charge inputs with stable positions.
2. Determine each rule's eligible **scope subtotal and quantity**, not a convenient whole-invoice total. A product-scoped threshold must not be satisfied by unrelated purchases.
3. Filter active/date/usage/threshold eligibility. Use periodStart for discount dates because the frozen contract says so; changing to issueDate is a separate decision for catch-up periods.
4. Apply the agreed product selection, fixed budgets and subscription ordering. Resolve ties by stable identifiers, not query order or creation timing.
5. Allocate discount savings to eligible charges if the approved tax model needs this; compute rounded taxes once, then build frozen snapshots and negative discount rows.
6. Return lines, totals, per-rule savings and distinct applied rule IDs. Persist nothing here; reserve real usage in the billing transaction.

The pure eligibility helper is advisory with respect to remaining usage. Two transactions can both observe the last available redemption. Only the database reservation can authorize consuming it.

### Fixed-amount budget ambiguity

The current contract selects the best product discount **per line**, aggregates a rule into one negative row, and consumes usage **once per invoice**. It does not clearly cap a FIXED rule across several matching lines.

Own example: one product worth ₹1,000 and a ₹100 fixed rule yields ₹100 savings. Splitting it into two ₹500 lines could yield ₹200 if the full fixed amount is applied independently to each line. Row splitting should not silently multiply a merchant's advertised fixed benefit.

Recommendation: A/B define a per-invoice rule budget for a fixed promotion, including how competing per-line candidates allocate that budget. Do not quietly add the cap while claiming to implement an unchanged contract. If the intended rule really is “₹100 off each line,” name it and test it. Either way, aggregate negative rows and usedCount consistently. Zero-saving rules should not consume usage.

Other choices that need explicit expected results: thresholds before/after earlier discounts, plan-fee participation, rule exhaustion during catch-up, cancelling an invoice without refunding redemption, and whether editing a rule may rewrite past eligibility. The foundation already answers several; retain those answers until A/B change them.

### Independent golden calculation

Illustrative case with hypothetical uniform 18% tax; numeric oracle, not a claim about the applicable rate:

```text
Plan fee                         ₹1,000.00
Product: 2 × ₹500.00              ₹1,000.00
Product discount 10%                ₹100.00
Subscription discount ₹200          ₹200.00
Gross subtotal                   ₹2,000.00
Total discount                     ₹300.00
Net charge base                  ₹1,700.00

Current post-tax contract:
  tax on ₹2,000.00 = ₹360.00; due = ₹2,060.00

Proposed invoice-time discount model:
  tax on ₹1,700.00 = ₹306.00; due = ₹2,006.00
```

A single approved mode must define the golden test. Also add mixed tax rates, one-paise allocations, a fully discounted line, tied promotions, a fixed value larger than the eligible base, duplicate line splitting, min quantity/product mismatch, date boundaries and exhausted usage. A 100% post-tax discount may still leave tax payable in the current model; the demo must not call that a zero-total invoice.

## Batch 4 — transactions, idempotency and recovery

### Public implementation evidence

ERPNext's subscription docs expose prepaid/postpaid timing, due terms and linked invoices. The reviewed v15 source separates period calculation, invoice construction and subscription processing, checks for an existing current-period invoice, and has per-subscription commit/rollback processing. This is useful structural evidence; a visible existence check is **not** by itself a concurrency proof. We did not audit all Frappe transaction behavior or constraints. [ERPNext subscription docs](https://docs.frappe.io/erpnext/subscription), [ERPNext v15 subscription implementation](https://raw.githubusercontent.com/frappe/erpnext/version-15/erpnext/accounts/doctype/subscription/subscription.py)

PostgreSQL unique constraints reject duplicate keys, while row locks serialize conflicting changes and release at transaction end. Consistent lock acquisition order reduces deadlocks. These mechanisms support our design independently of any closed provider's internals. [PostgreSQL constraints](https://www.postgresql.org/docs/16/ddl-constraints.html), [PostgreSQL explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html)

Prisma's **v7** transaction docs support interactive transactions, isolation options, bounded transaction timing and retries for P2034 conflicts. The generic latest transaction URL now describes a newer API, so implementation must use version-matched docs and the locally generated 7.10.1 types. [Prisma v7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)

### Proposed transaction, subject to A/B review

Retain one transaction **per subscription catch-up batch**, not one transaction for the whole billing run. The existing contract allows a default 24 periods per subscription, max 120 via input; transaction duration/payload limits still need measurement. Proposed flow:

```text
Capture one validated asOfDate for the run.
Read a bounded, stable list of candidate subscription IDs.

For each candidate, with bounded retry around the WHOLE transaction:
  1. Lock/re-read the subscription and recheck state, cursor and expiry.
  2. Compute due periods up to the requested cap; avoid unbounded loops.
  3. Load the required pricing/tax/rule inputs consistently.
  4. Lock and re-read candidate discount rows in a consistent UUID order.
     For multiple periods, establish an order for the union of needed rules;
     do not acquire D2 for period one then a lower D1 for period two.
  5. Build each draft using the pure calculator.
  6. Reserve positive-saving rule usages with conditional atomic updates.
     If a rule is exhausted, recompute from the locked, current eligibility.
     An unexpected reservation miss aborts/retries the whole transaction,
     so earlier reservations cannot survive an invalidated draft.
  7. Allocate invoice number with nextNumber(tx,...), then create invoice,
     frozen lines and DiscountUsage rows using this SAME tx object.
  8. Advance nextInvoiceDate only after all corresponding invoice writes.
  9. Auto-close only when expiry has passed and all billable periods are done.
  Commit; report created/skipped/failed only from the committed outcome.
```

Use the existing unique `(subscriptionId, periodStart)` as the final duplicate barrier. An application `findFirst` followed by `create` is not sufficient. Catch invoice-period P2002 **outside** the rolled-back transaction, reread current state, and classify a genuine concurrent completion. Do not turn unrelated invoice-number/usage uniqueness failures into silent skips. A stale cursor pointing at an existing invoice without a committed advance is an integrity/reconciliation problem, not permission to skip arbitrary periods.

Suggested initial isolation is Serializable with explicit subscription/discount locks and bounded retries; benchmark it against the required load before freezing this choice. Inspect actual errors from Prisma's pg adapter in integration tests rather than assuming every raw SQL error is wrapped identically. A retry repeats the complete transaction with fresh reads; it does not resume after the failed statement. No SMTP, HTTP requests or other irreversible effects inside a transaction that can be retried.

PostgreSQL warns that sequence increments are not rolled back on transaction abort. The repo uses a transactional Counter row, so use the supplied `nextNumber(tx, prefix, year)` instead of substituting sequence semantics or count+1. Its shared counter can become a throughput bottleneck; measure it rather than redesigning numbering prematurely. [PostgreSQL transaction isolation and sequence behavior](https://www.postgresql.org/docs/16/transaction-iso.html)

Define the complete lock order with A, including Counter access and any payment/subscription service interactions. Sorting only the discounts is not a proof that all other locks are consistently ordered.

### Atomic redemption reservation

The following is a design sketch, **not executed or installed SQL**. Parameterize IDs; never concatenate user input:

```sql
UPDATE "Discount"
SET "usedCount" = "usedCount" + 1
WHERE id = $1
  AND "isActive" = true
  AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")
RETURNING id;
```

The transaction must still validate the full agreed dates/scope/threshold predicates from a consistent rule version. Re-read counters after obtaining locks and account for usages already reserved by earlier periods in this same transaction. If removing a rule changes previously calculated savings, restart calculation/reservation transactionally rather than retaining counters for rules that no longer benefit the final invoice. Zero returned rows means the draft cannot consume that rule. For multiple catch-up invoices, increment once **per invoice** that actually benefits. Inserting DiscountUsage and increasing usedCount must roll back with invoice/cursor failure. Respect the existing unique(discountId, invoiceId).

### Bounded work and failure isolation

Do not load all subscriptions into JS or run thousands of transactions through unbounded Promise.all. Use bounded candidate reads, stable ordering and a small measured worker limit. Recheck under lock even if the initial query looked eligible.

The work predicate must distinguish “cursor overdue but beyond expiry” from an actually billable period. hasMore should represent remaining valid work. For cron draining, impose batch/time limits and stop/report no progress; a permanently failing subscription must not cause an infinite hasMore loop or starve the next subscription. Keep failed candidate IDs in the in-memory run context and surface failures; persistence/retry-queue expansion requires a later reviewed design.

### Required database tests, not mock substitutes

| Scenario | Proof required |
|---|---|
| Two calls for the same due subscription | One invoice per period; cursor advances exactly once per created period |
| Parallel calls on two subscriptions, usageLimit=1 | Exactly one qualifying redemption; both successful invoices reconcile |
| Failure after counter/usage/invoice writes | Whole transaction rolls back; no orphan line, consumed rule or advanced cursor |
| One bad subscription among healthy ones | Failure isolated; healthy candidates still finish |
| Catch-up > cap | First run commits only the cap; subsequent calls drain exactly the missing periods |
| Expired ACTIVE with backlog | All valid historical periods created before auto-close |
| Non-auto-close expired subscription | No future-period invoice and no infinite candidate loop |
| Forced retry/deadlock/serialization failure | Bounded whole-transaction retry; no duplicate business effect |
| Unrelated unique failure | Returned as a real failure rather than an invoice-period skip |

Use two independent DB connections and an explicit synchronization barrier for race tests; Promise.all alone may serialize by accident. Check database rows, totals, cursor and counters after both calls. Run destructive fixture cleanup only in a dedicated, verified test database, not a teammate's or demo database. Previous foundation checks did not apply the migration to a live PostgreSQL instance; this remains an implementation prerequisite to verify, not evidence already obtained here.

## Batch 5 — scheduler, India payment boundaries and handoff

### What scheduled billing does and does not mean

Odoo documents recurring-invoice scheduled actions and separate conditions for automated collection. Its automatic-payment documentation describes suspending scheduled activity after an ambiguous payment failure to avoid an accidental repeat charge. Our app currently records payments manually; if gateways are added later, an unknown debit outcome needs reconciliation rather than a new charge attempt. [Odoo 18 scheduled actions](https://www.odoo.com/documentation/18.0/applications/sales/subscriptions/scheduled_actions.html), [Odoo 19 automatic payments](https://www.odoo.com/documentation/19.0/applications/sales/subscriptions/automatic_payments.html)

Cashfree's subscription overview describes a mandate as the authority for periodic or on-demand debits. Our Payment.method enum value UPI is only a recorded payment method; it is not an authorization token or debit mandate. [Cashfree subscription overview](https://www.cashfree.com/docs/payments/subscription/introduction)

RBI's **21 April 2026 consolidated E-mandate Framework** requires registration authentication, customer controls and pre/post-transaction notifications, with specified exceptions. It replaces listed earlier circulars. This research verified the current consolidated source rather than treating an old 2024 circular as the complete current framework. A gateway/issuer handles a separate regulated collection flow; our invoice cron must not claim to implement it. AutoPay integration is outside B's current scope. [RBI E-mandate Framework 2026](https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=13374)

### Duplicate events versus duplicate invoices

Razorpay documents duplicate webhook deliveries, event IDs and out-of-order events, with signature validation on the raw request body. Cashfree's Payment Gateway docs distinguish order IDs from distinct payment-attempt IDs and only finalize a successful payment under its documented conditions. These identifiers serve different purposes from our `(subscriptionId,periodStart)` invoice key. [Razorpay webhook validation/idempotency](https://razorpay.com/docs/webhooks/validate-test/), [Cashfree webhook idempotency](https://www.cashfree.com/docs/payments/online/webhooks/webhook-indempotency)

For a future gateway adapter: persist verified provider event/attempt IDs, make the business reconciliation idempotent, confirm amount/currency/invoice linkage and reject backward state changes. Do not assume a universal idempotency header exists for every provider endpoint. None of that requires adding webhooks to this hackathon implementation now.

### Scheduler recommendation for the installed stack

node-cron exposes timezone and overlap controls. Its versioned 4.2.1 source creates a task-local runner; process-local overlap control does not replace database coordination across API instances or a simultaneous manual billing action. Check installed package types before using newer documentation features, especially distributed options. [node-cron scheduling options](https://www.nodecron.com/scheduling-options.html), [node-cron 4.2.1 task source](https://raw.githubusercontent.com/node-cron/node-cron/v4.2.1/src/tasks/inline-scheduled-task.ts)

B should export scheduler start/stop functions from the owned server/src/jobs/billing.ts; importing a pure domain/service module must not start timers. Manual POST and cron invoke the same runBilling service. A wires lifecycle/config in A-owned files, removes the current intentional scheduler refusal only when real wiring exists, and stops tasks on shutdown.

Keep current UTC date semantics until A/B approve a change. A `0 0 * * *` cron in UTC runs at 05:30 IST; midnight Asia/Kolkata has a different UTC instant. Merely switching the scheduler timezone without changing asOfDate derivation can bill the previous UTC date at local midnight. Choose both the scheduler trigger timezone and business-date definition together. Do not change the DB date key based on the machine's local timezone.

Log run ID, fixed cutoff date, candidate count, invoice count, skipped/failed/autoClosed counts, retry count, duration and hasMore. Never log passwords, raw reset tokens or DB connection credentials. A missed cron run is recovered by cursor-based catch-up, not by remembering which wall-clock timers fired.

## Decisions to settle before implementation

All entries below are **research recommendations or unresolved choices**, not approved contract edits. A writes any accepted schema/API changes; B implements against the accepted version.

| ID | Decision | Current contract/model | Recommendation / required action | Blocks |
|---|---|---|---|---|
| DEC-01 | Discount tax base | All discounts are post-tax rebates | Prefer an explicit invoice-time discount model for India-style tax invoices; define allocation/snapshots and update A-owned artifacts if adopted | Final B-04 tax golden oracle |
| DEC-02 | FIXED promotion budget | Best rule per line; budget across matching lines unclear | Define per-invoice vs per-line cap; prevent unintended benefit multiplication by splitting rows | B-04 selection/allocation |
| DEC-03 | Pause/resume and closed renewal | Preserve cursor; catch up gaps | Explicitly approve deferred charging or revise schedule/waiver representation; also define expired PAUSED auto-close | B-05 and lifecycle integration |
| DEC-04 | Historical rate/plan changes | Mutable taxes/plan fee; no rate versions | Demo may use a declared current-rate convention; production historical billing needs effective-dated pricing/tax evidence | B-06 historical accuracy |
| DEC-05 | UTC vs Indian business day; fiscal numbering | UTC dates + calendar-year counter example | Retain UTC demo semantics unless revised; separately design India fiscal-year numbering before GST deployment | B-07 / production numbering |
| DEC-06 | Public domain signatures | Only some helper signatures are frozen | Agree typed input/output DTOs and safe-integer boundaries; no Prisma in pure domain code | B-01, A/D integration |
| DEC-07 | Isolation/retry/work limits | Transaction invariant fixed; complete lock order and scan limits not specified | Start from proposed row locks + Serializable, bound retries/scans, test pg-adapter errors and counter contention | B-06 reliability |

Batch 1's parsing/rounding primitives and Batch 2's anchor arithmetic can be implemented independently of the tax-base decision. Do not postpone those safe foundations while a policy question is resolved. Conversely, do not code a final tax/discount golden invoice and then retrospectively call it the agreed policy.

## Implementation batches after this research is reviewed

| Order | Proposed deliverables | B-task mapping | Exit criterion |
|---|---|---|---|
| 0. Decision pass | Record DEC-01–07 outcomes with A; update contract/types/migration only through A | B-01 | One accepted policy set and exact public interfaces |
| 1. Exact math and calendars | domain/money.ts, price.ts, tax.ts, period.ts; focused unit tests | B-02, B-03 | Bounds/rounding/anchors/leap/expiry tests pass |
| 2. Pure billing policy | domain/discount.ts, states.ts, invoice-draft.ts; fixtures + table/golden tests | B-04, B-05 | Deterministic line/discount/tax totals and exhaustive transitions |
| 3. Database engine | billing-engine/service.ts + PostgreSQL race/rollback tests | B-06 | Idempotency, last-redemption race, failed-sub isolation, cap and closure proven |
| 4. Controller and job | billing routes/controller, owned job module, A startup/config handoff | B-07 | Auth guards preserved; manual/cron same service; no import-time cron |
| 5. Integration handoff | docs/status/B.md, actual test results, known gaps and launch instructions | B-08 | A/D/C can consume public outputs without copying calculations |

These are implementation boundaries, not a new promised stopwatch estimate. The old 195-minute budget assumes a working local database, agreed policies and no model changes. Tax/lifecycle changes or environment setup require re-estimation against Monis's actual availability; research time is not implementation already completed.

### Proposed module interfaces to agree, not new frozen API declarations

Keep currently frozen exports such as `computeLineTax(baseMinor: number, percentage: string): number`, `findApplicableDiscounts(...)` and `runBilling(input): Promise<BillingResult>`. Additional pure helper interfaces must be agreed with A before consumers import them. A good internal boundary has:

- DateOnly and monetary inputs independent of HTTP or ORM types.
- A calculator result containing ordered immutable lines, subtotal, discountTotal, taxTotal, total and distinct rule usages with exact saving amounts.
- A period result containing start, exclusive end, next natural boundary and a has-more indicator.
- State-policy input including current/target status, plan flags, explicit today/expiry/renewal context and an explainable denial result.

Domain helpers never query mutable global state, start cron, write invoices or send email. B's transaction service performs persistence; A owns client-facing serialization and mutation policies in A's modules. D's seed should call approved math helpers, not hand-build incompatible totals.

## Completion criteria for the research phase

- [x] All B tasks mapped to researched batches and later implementation deliverables.
- [x] Indian provider behavior checked against primary documentation; open source inspected where available.
- [x] Exact arithmetic, dates, discount rules, states, transactions, cron and India payment boundaries covered.
- [x] Existing contract/model audited; differences recorded without silently changing it.
- [x] Test cases and race/recovery proofs specified, with mock tests distinguished from database evidence.
- [x] Source versions/access limitations recorded; no claim of provider-private implementation knowledge.
- [ ] A/B choose the decision outcomes before dependent implementation.
- [ ] Local PostgreSQL migration and new domain/billing tests run in the implementation phase.

Only this research document and Monis's research status note are produced in this phase. No application code, schema, API contract, package or scheduler behavior is changed.

## Source and quality notes

All linked sources were researched on 31 October 2026. Links beside individual claims are the supporting sources; the following notes qualify their use:

- **Primary provider documentation:** Razorpay and Cashfree pages describe their public integration contracts; Zoho `/in/` pages describe the India edition. Chargebee pages describe its configurable product behavior. None establish that an internal implementation uses our proposed row locks or schema.
- **ERPNext:** docs are current, while inspected source is explicitly `version-15`. Do not assume every newer documentation feature exists in that branch. Source function names were examined, not copied. End-to-end transaction/concurrency correctness was not audited.
- **Odoo:** scheduled-action source is version 18.0 and automatic-payment source is 19.0; the direct 19.0 scheduled-action fetch timed out. This is intentional version labeling, not an assumption that all details are identical.
- **Prisma:** use the explicitly versioned v7 page for this pinned v7.10.1 repo. A generic latest-doc URL redirected to newer ORM documentation with different APIs; it is not an implementation recipe for this project.
- **PostgreSQL:** links use version 16, matching the project's stated minimum; actual integration tests must use the locally installed server and migrations.
- **node-cron:** general docs may be newer than a lockfile release. Only timezone/noOverlap are proposed without further package verification; distributed scheduling is not assumed.
- **CBIC:** taxinformation portal pages were available as indexed primary-source text but returned HTTP 502 on direct fetch. Invoice fields and the invoice-time discount principle were cross-checked against stable CBIC publications. The older Act PDF is explicitly dated 2022. We have not certified a complete consolidated GST ruleset, actual product rates or the commencement of every 2026 post-supply change.
- **RBI:** the official consolidated 21 April 2026 framework was fetched successfully and is used instead of older repealed circulars. No gateway limits are added to our invoice calculator, and no AutoPay implementation is implied.
- **Arithmetic quality:** the Chargebee ordering KB's example contains inconsistent arithmetic. Its declared sequence was compared, but our golden totals were independently recomputed. Provider docs are evidence, not unquestioned test fixtures.
- **Excluded evidence:** search results from Reddit, third-party tutorials and provider comparison posts were not used as authority for algorithms, law or backend guarantees. Inaccessible guessed URLs were replaced with working official links or disclosed as limitations.
