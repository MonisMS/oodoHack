# Brightloop — four isolated workstreams

This is the original React/Vite + Express + LOCAL PostgreSQL scope, not the alternate Next.js/Neon team plan. A/B/C/D refer to workstreams, not inferred real-world identities. Estimates are focused implementation time including each task's own validation. Times below are the requested hackathon schedule, IST, not an assertion that today's wall clock is before kickoff. If kickoff changes, shift all checkpoints together and preserve the reserves.

Foundation scaffold is the current deliverable; checkboxes below track follow-on feature work. Do not read a registered route or 501 response as a completed feature. A estimates include the foundation already produced.

Capacity: 09:00–16:15 = 435 min/person, then no new features. A MUST=395 min (~50% weighted complexity); B MUST=335 (~30–35% incl. UI polish); C MUST=230 (~10%); D MUST=240 (~5–10%). Weighted complexity is not elapsed time; all four work concurrently. SHOULD/NICE are outside the MUST budgets and only start after acceptance tests pass. A has 40 min integration reserve before feature freeze; B 100, C 205, D 195 min, usable for testing their own work and reviewing A. Nobody takes A-owned implementation without an explicit ownership transfer.

## A — lead, shared foundation and core billing (~50%)

1. [x] **MUST · 45 min · FND-01** — Review schema + all contract decisions, scaffold root/client/server, generate initial migration, verify build/tests, commit foundation on main. Share `foundation-v1`; contracts freeze. (Remote publication depends on Git access.)
2. [ ] **MUST · 30 min · A-01** — Tax/discount CRUD services + plain forms, computeLineTax/findApplicableDiscounts pure tests; validate discount caps, dates, quantity, and usage limits. Seed fixtures are test input only, never UI data.
3. [ ] **MUST · 35 min · A-02** — Quotation template CRUD, subscription creation from blank/template, line price resolution/min quantity/availability, number via nextNumber(tx), transactional state machine + history. Add exact invalid-transition 409 tests.
4. [ ] **MUST · 70 min · A-03** — Billing transaction: lock subscription; anchored catch-up periods; plan fee + frozen lines/taxes; deterministic discounts; conditional usage reservation; invoice and DiscountUsage creation; cursor advance; bounded retries; expiry auto-close only after catch-up. Test idempotency, rollback, Jan31/leap-year boundaries and concurrent usageLimit=1.
5. [ ] **MUST · 20 min · A-04** — POST /billing/run and daily node-cron calling the same service, hasMore drain, per-subscription failure isolation. Document enabling BILLING_CRON_ENABLED only after scheduler is wired. Demonstrate two clicks produce zero duplicates.
6. [ ] **MUST · 30 min · A-05** — Invoice list/detail, confirm/cancel/send, SMTP or console-dev HTML email, sentAt; authorized client print route with print CSS. Confirm zero-total invoices to PAID. Cancel blocked when payments exist.
7. [ ] **MUST · 60 min · A-06** — Subscription list/filter/form/detail with history/status bar and allowed action buttons; template selector; invoice filters/detail/print; billing button/result. Query-backed real data and field errors; plain controls work while B builds UI kit.
8. [ ] **MUST · 35 min · A-07** — Connect A's forms to B's stable UI exports, complete taxes/discount pages, invalidate relevant query keys after mutation; server pagination everywhere. Review C's auth replacement for unchanged middleware signatures.
9. [ ] **MUST · 70 min · A-08** — Integrate/review B/C/D PRs incrementally, run full demo flow and SQL constraint checks, confirm local DB setup, fix integration blockers in A-owned paths, record test results. Includes checkpoints 11:30/13:30/15:30. Total A MUST 395 min.
10. [ ] **SHOULD · 20 min** — Billing preview API (contract addition through A), operational cron overlap metrics, cancel/send UX refinements.
11. [ ] **NICE · 20 min** — Bulk invoice confirmation and CSV export (contract additions through A).

## B — products, plans and UI kit (~30–35%)

1. [ ] **MUST · 20 min · B-01** — Read contract, create own branch, run setup; define exported UI prop shapes in `client/src/components/ui/CONTRACT.md` before implementation. Add new UI files without editing A's PageHeader/EmptyState base. Base ownership transfer below is explicit.
2. [ ] **MUST · 55 min · B-02** — Product + variant CRUD, admin mutations/staff read, relation validation, deactivation, effective base+extra display, server/client Zod rules. No edits to frozen schema/contract.
3. [ ] **MUST · 45 min · B-03** — Plan CRUD, all flags and dates, min quantity, tax selection. Validate availableFrom < availableTo and quantity >=1 on both ends.
4. [ ] **MUST · 50 min · B-04** — UI kit: server-controlled DataTable (page/pageSize/total, sort/filter callbacks), FormField(errors), StatusBadge, ConfirmDialog, Toast. No internal fetches, no full-dataset filtering. Use existing EmptyState/PageHeader without changing their APIs.
5. [ ] **MUST · 60 min · B-05** — Product/variant list/form/detail and plan list/form/detail, real TanStack Query requests, forms, validation, mutation feedback, empty/loading/error states and query invalidation. Staff cannot mutate via either UI or API.
6. [ ] **MUST · 45 min · B-06** — Responsive/theme review across all pages. Report needed changes to each feature owner; only edit B's modules and owned UI files. Check keyboard/focus, mobile navigation, tables and overflow.
7. [ ] **MUST · 60 min · B-07** — Catalog tests/smoke tests, demonstrate Odoo Brand +560, attend checkpoints, review UI integration and repair B-owned bugs. Total B MUST 335 min.
8. [ ] **SHOULD · 30 min** — Additional sorting/filter controls and toast queue refinements.
9. [ ] **NICE · 25 min** — Product images and cosmetic animation; no schema expansion without A.

## C — auth, users and customer portal (~10%)

1. [ ] **MUST · 20 min · C-01** — Contract review, branch/setup, password cases; prepare public forms while DB setup finishes. Use the frozen server validator; mirror byte-length/rules client-side.
2. [ ] **MUST · 45 min · C-02** — Signup/login/logout/me, lowercase unique email, bcrypt+JWT Bearer, active-user lookup. Replace server middleware behind requireAuth/requireRole signatures. Replace client session implementation + token wiring; remove dev-role UI from production behavior.
3. [ ] **MUST · 35 min · C-03** — Forgot/reset forms + endpoints, random raw token emailed or logged in dev, only SHA256 hash persisted, 30 min expiry, neutral response, atomic one-time consumption and password change. Test token reuse/expiry and duplicate email 409.
4. [ ] **MUST · 25 min · C-04** — ADMIN-only create/list staff; customer lookup list for A. No role input accepted at signup. Use own module routes, do not modify the shared nav registry.
5. [ ] **MUST · 45 min · C-05** — Customer portal summary, my subscriptions/list/detail, my invoices/list/detail/print, all server-filtered by principal. Reuse A's public invoice service exports only with explicit ownership context; no trusted customerId query. If A's print UI is late, render authorized detail plus local print CSS.
6. [ ] **MUST · 35 min · C-06** — Public login/signup/forgot/reset and staff UI, role redirects. CUSTOMER gets portal, ADMIN/STAFF dashboard. Connect shared session context without changing other modules.
7. [ ] **MUST · 25 min · C-07** — Cross-customer access negative tests, wrong-role staff creation, logout behavior, production refusal of dev headers; checkpoints and bug fixes. Total C MUST 230 min.
8. [ ] **SHOULD · 25 min** — Rate-limit login/reset and neutral timing defenses.
9. [ ] **NICE · 30 min** — Staff deactivation/password change (requires A's API update).

## D — payments, reporting, demo seed (~5–10%)

1. [ ] **MUST · 20 min · D-01** — Contract review, branch/setup, prepare deterministic demo personas/data plan. Implement seed.ts only after A's scaffold handoff.
2. [ ] **MUST · 45 min · D-02** — Payment record/list with invoice row lock, amount >0 and <=outstanding, no future date, confirm/partial/full state updates in one transaction. Test concurrent overpayment rejection and DRAFT/CANCELLED invoice rejection.
3. [ ] **MUST · 35 min · D-03** — Payment form/list, outstanding/overdue views using invoice filters; query invalidation after record. Add `client/src/modules/payments/components/PaymentForm.tsx`, then A mounts it; do not edit A's invoice page.
4. [ ] **MUST · 45 min · D-04** — Reports summary API using SQL aggregates and indexed joins, KPIs, monthly payment revenue, range/status/customer/plan filters. Consistent exclusion of drafts/cancelled from outstanding, no client JS aggregate loops.
5. [ ] **MUST · 35 min · D-05** — Dashboard KPI cards + Recharts revenue chart + filter form, loading/error/empty states, links to overdue invoices. No static JSON chart values.
6. [ ] **MUST · 40 min · D-06** — Idempotent seed with faker (add dependency in D-owned module manifest only if A accepts root lockfile update), 1 admin, 2 staff, ~300 customers, 10 products+variants, 6 plans, 3 discounts/taxes, templates, ~5,000 subscriptions across all states + invoices/payments. Deterministic IDs and nonproduction opt-in for --perf. Measure list/dashboard <2s; report SQL timings/index requests to A.
7. [ ] **MUST · 20 min · D-07** — DEMO.md exact 4-minute walkthrough, known demo logins, proof of no duplicate billing + partial/full payment + chart update; checkpoints and D-owned fixes. Total D MUST 240 min.
8. [ ] **SHOULD · 25 min** — Payments by method breakdown (API addition through A), more performance scenarios.
9. [ ] **NICE · 20 min** — CSV reports/downloads.

## Dependency table — start now, integrate against contracts

| Consumer | Needs / producer | Needed by (IST) | Workaround while waiting |
|---|---|---|---|
| Everyone | Foundation schema/contract/client-server shells / A | 09:45 | Read contracts, design own components/tests; no parallel schema edits |
| A | Product/plan API / B | 11:30 | Seed valid local catalog rows in isolated test DB, use real IDs; no UI mock data |
| A + D | JWT principal / C | 11:30 | Explicit dev headers against nonproduction API, same guard signatures |
| A/C/D | New UI kit exports / B | props by 10:15, components by 12:30 | Existing PageHeader/EmptyState and accessible native controls; API response types stay fixed |
| C | Subscription/invoice real data + public service exports / A | 13:30 | Build read-only portal against contract and isolated seeded rows; keep 501/error states visible |
| D | Confirmed invoice fixture + frozen schema / A | 11:30 | Insert transactional test fixture in test DB; payment logic needs no completed invoice UI |
| A | PaymentForm public props + payment mutation / D | 13:30 | Invoice detail temporarily shows outstanding amount and payment section pending |
| D | Billing engine + invoice UI / A | 13:30 core, 15:30 final | Seed consistent invoice rows for report/perf work; final demo must run real billing |
| Everyone | Full seed + DEMO.md / D | 15:30 | Small hand-built local test fixtures; do not claim perf proof until measured |
| A | Reviews and feature branches / B/C/D | 11:30,13:30,15:30 | Small PRs, green checks; module registry already imports every route once |

A integrates continuously; dependencies gate final verification, not starting the task. At each checkpoint pull main, apply migrations, seed the local demo DB and smoke-test auth→catalog→subscription→billing→invoice→payment→dashboard. API 501 means the owning workstream is still pending, not a server failure to paper over with mock data.

## Cut list (first to drop → last)

1. NICE: CSV, images, animations, extra report breakdowns.
2. SHOULD: bulk actions, billing preview, extended cosmetic controls, extra staff administration.
3. Fancy UI polish: keep responsive accessible forms/tables and clear errors; replace richer components with native controls in each owner's folders.
4. Extra data beyond the 5,000-subscription performance proof, additional chart variants, extra demo narratives.
5. If MUST is at risk, freeze scope and reassign explicitly through A; do not silently omit required product/plan CRUD, password reset, customer isolation, print/email, taxes/discounts or local DB performance validation.

Never cut invoice uniqueness, transactional cursor/usage/payment updates, tax snapshots, state/role checks, money correctness, real dynamic data, core regression tests or the local PostgreSQL requirement. 16:15 feature freeze, bug fixes only to 16:45; record video at 16:45; 17:00 code freeze, video due 17:30 IST.
