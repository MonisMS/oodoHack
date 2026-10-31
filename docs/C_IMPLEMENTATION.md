# C implementation and verification handoff

Completed locally on 31 October 2026 on codex/c-catalog-reporting, originally based on main e3e0dc8. The user reassigned C's work to this chat. A separate concurrent checkpoint, 2061dda (added the ui screens), was committed/pushed while work was underway and has been preserved. The user authorized committing and pushing the final verified improvements.

## Nine MUST tasks

| Task | Delivered |
|---|---|
| C-01 | Frozen API/DTO/session contracts followed; isolated local branch; published docs/C_UI_CONTRACT.md with compatible component props and query keys. |
| C-02 | Products/variants/plans CRUD, explicit Decimal DTOs, active tax validation, variant-product ownership, stable SQL pagination/search/sorting, soft deactivation and locked updates. |
| C-03 | Real product/variant/plan lists, forms and details, search/pagination/sorting, inline validation, loading/error/empty states, feedback, archived status and exact display of base+variant once. |
| C-04 | Discount CRUD/screens: product picker, scope/value/dates/thresholds/usage limit, read-only usage. Existing usage cannot be reset or lowered below usedCount. The row lock coordinates with B's redemption locks. |
| C-05 | Shared UI kit, Inter typography, consistent shell, mobile navigation, native dialogs, accessible fields, notifications, table/pagination and public prop contract. |
| C-06 | Real sign-in/signup/forgot/reset forms via A's useSession interface, live password policy checklist, staff/customer lists, ADMIN staff creation and account updates; admin mutation controls hidden from staff. |
| C-07 | Real PostgreSQL aggregate reporting and dashboard with active count, payment revenue, outstanding/overdue, monthly chart/table and composed date/customer/plan/status filters. No static chart data or full-table JS aggregation. |
| C-08 | Opt-in disposable-local measurement harness; 5,000 subscriptions, 15,000 invoices/payments, 30,000 invoice lines; authenticated HTTP timing, ledger-total assertions and query-plan evidence. |
| C-09 | Full financial/security/catalog/report regression, desktop/mobile browser checks, real UI create flows and date submission fixes, permission-state review and handoff. |

## Backend and reporting decisions

Existing request/response schemas, routes, financial rules and Prisma migrations were preserved. No dependency manifest/lockfile change was needed. Catalog input integer bounds and unsupported year zero are checked before SQL, returning field-level 422 errors. The report date boundaries use the same calendar validation. Catalog name search escapes LIKE wildcard characters so percent/underscore are literal. Unsupported sort fields return 422. Catalog DELETE retains financial references through soft deactivation. A product's variants are capped at 100 to bound child responses.

Reports use parameterized SQL and a RepeatableRead transaction. Active subscriptions use current ACTIVE status and subscription start-date filters. The selected subscription status/customer/plan filters compose with every metric. Open balances use confirmed/partially-paid invoice totals minus their committed amountPaid, filtered by invoice issue date. Revenue and monthly groups come from payment amounts and payment dates. Joins do not multiply payments by invoice lines. Overdue comparisons capture one business date for the report. DTO money is formatted explicitly to two decimal places.

Real browser testing found native date values could be displayed without reaching the saved filter state. Report and catalog date fields now submit named FormData values and remain intact across other field changes. The repaired report was rechecked: from/to/customer appeared together in the URL and changed October collections to the expected actual amount.

## Verification

- Full database-enabled suite: **205 passed, zero skipped/todo, 20 files**. The nine new grouped catalog/report tests cover relation validation, roles, precision, variant ownership/duplicate conflicts, frozen subscription prices, soft deactivation, limits/usage preservation, literal search/sort/pagination and exact filtered report totals.
- Client/server TypeScript and production build pass. C feature routes, including the chart, are lazy-loaded. The measured main entry chunk is about 451 kB and the separately loaded chart chunk about 389 kB; the final build has no over-500-kB chunk warning.
- Browser: admin/staff sign-in and sign-out; real product creation with normalized decimal input; empty-form errors; Odoo variant +560 shown as 1,760 on a 1,200 base; plan creation and saved pause permissions; product-scoped discount creation with searchable selections; report date/customer filters; staff list/form validation; staff catalog lacks admin create controls.
- Responsive review: desktop 1440x1000, default tablet view, and mobile 390x844. Mobile page width did not overflow. Metrics/chart/receivables stack. Hidden sidebar links are inert; opening the drawer focuses navigation and hides background from accessibility; Escape closes and restores focus.
- The old adversarial invoice test persisted an intentionally inconsistent payment row, contaminating later whole-ledger checks across repeated runs. It now exercises genuine recorded partial payment and verifies cancellation/reopen refusal while keeping ledger invariants valid. Production financial services were not changed by that test fix. A fresh disposable app-test DB was used, and existing application data was untouched.

### Performance evidence

The slowest measured endpoint sample was **39.8 ms**, under the 2,000 ms target. Fixtures used B's exact draft/money helpers; aggregate results were asserted against the generated ledger. Seven sequential samples per endpoint included cookie-authenticated HTTP and response parsing; the maximum of seven is reported conservatively as p95. This is a local API benchmark, not an Internet/browser paint SLA or a multi-user concurrency load test.

| Endpoint | Median ms | Conservative p95 ms |
|---|---:|---:|
| /products | 9.1 | 39.8 |
| /plans | 6.0 | 18.8 |
| /discounts | 5.7 | 7.0 |
| /users/customers | 5.4 | 14.0 |
| /subscriptions | 11.2 | 19.3 |
| /subscriptions?page=250 | 12.0 | 13.8 |
| /invoices | 15.0 | 27.0 |
| /payments | 11.4 | 14.2 |
| /reports/summary | 25.4 | 30.1 |
| /reports/summary?from=2026-07-01&to=2026-09-30&planId=<fixture-plan> | 15.7 | 16.6 |

Machine-readable evidence and EXPLAIN ANALYZE/BUFFERS output: docs/performance/C_API_BENCHMARK.json. Generated benchmark rows were removed using only this run's IDs. No schema/index change was necessary for the measured workload.

## Re-running checks

Use four separate disposable local test databases so parallel workers cannot invoice or inspect each other's fixtures:

```bash
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_app_test'
export BILLING_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_billing_test'
export BILLING_FLOW_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_flow_test'
export CATALOG_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_catalog_test'
# Apply the committed migrations independently to each database before running tests.
DATABASE_URL="$TEST_DATABASE_URL" npm test
npm run typecheck
npm run build
```

The catalog integration suite rejects non-loopback/non-test database URLs. Without its variable, its database cases are skipped; that is not the full 205-test verification.

To reproduce the benchmark, migrate another disposable local test DB, then explicitly opt into fixtures:

```bash
NODE_ENV=test PERFORMANCE_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/brightloop_performance_test' \
  npm exec -w server -- tsx scripts/measure-c.ts --fixtures --output=performance.json
```

The harness refuses production, non-loopback URLs, names without test, or a missing --fixtures flag. It cleans only owned IDs in finally.

## D dependencies and limits

Tax relation fields are implemented, but the current /api/taxes handler is still D's 501 placeholder. The picker shows an unavailable message and preserves existing IDs until D's tax API lands. It does not fabricate tax options. Real SMTP/reset/invoice delivery is still D's work; the forms call A's existing interfaces. D's operational screens, portal, shared demo seed and final QA/demo delivery remain pending. The preview screenshots use a separate real local fixture database, not customer/production data.

The C implementation does not take over B's scheduler continuation issue, payment request idempotency, customer lifecycle permissions or other A/B accounting/security decisions identified in the earlier review.

## Design references and assets

The visual direction takes restraint/hierarchy cues from [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh), with light surfaces, one teal accent and no gradients. The locally hosted [Inter font](https://github.com/rsms/inter) includes its redistribution license. Icons are lightweight inline SVG, not an added dependency.
