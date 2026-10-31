# QA checklist and results

Executed on 31 October 2026 against the **5,000-subscription seed** (`npm run db:seed -- --perf`: 303 users, 5,009 subscriptions, 15,854 invoices, 9,374 payments) through the real HTTP API, plus a real Chrome session for the screens. Result column is what actually happened.

## 1. The journey (scripted, real API): 26 of 26 passed

| # | Check | Result |
|---|---|---|
| 1-2 | Admin and customer sign in with the demo accounts | pass |
| 3 | Quotation template available (CRM Starter, plan Monthly, 30 days) | pass |
| 4-5 | Subscription created from the template; Odoo variant price **1,560.00** (1,000 + 560, counted once) | pass |
| 6 | Draft → Quotation → Confirmed → Active | pass |
| 7 | Illegal jump back to Draft refused (409 `INVALID_TRANSITION`) | pass |
| 8 | Billing run creates the due invoice | pass |
| 9 | Billing the same date again creates **0** (never billed twice) | pass |
| 10 | Billing a future date refused (422) | pass |
| 11 | Totals add up: subtotal 3,620.00 + 18% GST 651.60 = 4,271.60 | pass |
| 12 | Invoice confirmed, due date = issue + 15 days | pass |
| 13 | Half payment → Partially paid, balance exactly half | pass |
| 14 | Overpayment refused (422, names the remaining balance) | pass |
| 15 | Paying the balance → Paid, 2 payments recorded | pass |
| 16-17 | Cancel at period end sets the end date; withdrawing restores it | pass |
| 18 | Customer portal summary populated | pass |
| 19 | A customer sees only their own issued invoices (no drafts) | pass |
| 20 | Another customer's invoice → 404 | pass |
| 21 | Customer calling the staff API → 403 | pass |
| 22 | Customer passing a `customerId` to the portal → 422 | pass |
| 23 | Overdue invoices listed for chasing | pass |
| 24-25 | Reminder sent; a second reminder within 24 hours refused (409) | pass |
| 26 | Subscription list with 4,177 active subscriptions answers in 28 ms | pass |

## 2. Speed at 5,000 subscriptions (requirement: every page under 2 seconds)

| Request | Measured |
|---|---|
| Subscriptions list (default, page 200, status + sort, search, page size 100) | 17 to 83 ms |
| Invoices list (default, overdue, not overdue, status + dates, search, page size 100) | 18 to 78 ms |
| Payments list, templates, taxes, customers, subscription and invoice detail | 12 to 40 ms |
| Billing run for one period | about 80 ms for a few subscriptions; the whole seed history (about 16,000 invoices) bills in under 5 minutes |

Found and fixed during this QA: binding the API to IPv4 only made clients that try IPv6 first wait **2.07 s on every request**. The API now listens on `127.0.0.1` and `::1`; measured 16 to 83 ms afterwards.

## 3. Screens in a real browser (Chrome, signed in with the demo accounts)

- Loaded without JavaScript errors: Subscriptions, Invoices, Payments, Taxes, Quotation templates, Run billing, invoice detail, customer portal (desktop and 390 px wide).
- Invoice detail checked visually: status and overdue badges, per-line GST, totals, reminder history and only the actions that apply to the invoice's state.
- Known and expected: forms that need a product or plan picker show "could not be loaded" until the catalog endpoints exist (they answer 501 today).

## 4. Automated suites: 231 server tests passing

Auth, role guards on every endpoint, customer isolation, payments (including parallel payments), billing (idempotency, concurrency, rollback), subscriptions, taxes, email, seed (idempotent, refuses production, never touches non-seed data) and the portal.

## 5. Defects found and routed

| Found | Owner | Status |
|---|---|---|
| API bound to IPv4 only: 2 s per request on Windows clients | A | fixed |
| Seed could bill an unrelated subscription whose `notes` is NULL (SQL `NOT` over NULL) | D | fixed, covered by a test |
| `contracts.ts` held a raw NUL byte (file treated as binary by git) | A | fixed |
| Product, plan, discount screens and endpoints, login/signup/reset screens | C | not built yet (answer 501 / no page) |
| Sign-up reveals whether an email is registered (accepted trade-off) | A | accepted |

## How to rerun
```bash
export TEST_DATABASE_URL=...  BILLING_TEST_DATABASE_URL=...  BILLING_FLOW_TEST_DATABASE_URL=...  SEED_TEST_DATABASE_URL=...   # four disposable local databases with "test" in the name
npm test -w server
npm run typecheck && npm run build
```
