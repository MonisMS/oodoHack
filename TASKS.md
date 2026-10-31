# Brightloop — rebalanced team plan

## People, workload and decision authority

All four members have Codex. Shift repetitive implementation, full feature screens, predictable CRUD, test fixtures and verification to Adit Chobe and Ansh. The lead and Monis keep backend architecture and critical decisions. This changes actual deliverables and ownership, not just the percentages.

The first lead is **Ujjwal** in the supplied TEAM_PLAN; this document uses **Lead (A)** to avoid ambiguity in the later name spellings. **Monis (B)** is written Monish in the earlier plan. **Adit Chobe (C)** and **Ansh (D)** are the other two members. A/B/C/D now map to these people; they replace the earlier unnamed workstream mapping.

| Person | Tool | Weighted workload | Main responsibility |
|---|---|---|---|
| **Lead (A)** | Codex | **35%** | Schema/contracts, auth and tenancy security, subscription/invoice/payment backend, integration and final technical decisions |
| **Monis (B)** | Codex | **30%** | Money/tax/discount rules, dates, state machines, invoice calculation, billing transactions and concurrency |
| **Adit Chobe (C)** | Codex | **18%** | Catalog and discount administration, UI kit, auth/staff screens, SQL reports/dashboard, performance measurements |
| **Ansh (D)** | Codex | **17%** | Subscription/template/invoice/payment/billing screens, customer portal, specified tax CRUD, email templates, seed data, print and QA |

Weights total 100% and represent complexity/accountability, not lines of code or minutes. C and D own substantial implementation volume; A and B retain the highest-risk logic and review authority. Each person delivers working code, tests and a handoff using their own Codex session. No one waits for the leads to generate their UI or repetitive CRUD.

**Decisions reserved to A + B:** database structure and migrations; API/input/response changes; money representation and rounding; discount eligibility/stacking; billing period/expiry/pause/renewal semantics; numbering/idempotency; transaction boundaries, row locks and retries; payment reconciliation; authentication/session/role/tenant policies; destructive data operations. A is the sole schema/contract editor and final merge owner. B owns financial/domain decisions; after B leaves, A handles urgent fixes against B's documented rules. C/D implement the frozen rules and may propose changes, but must not invent or change these policies.

**Delegated decisions:** C/D choose component composition, forms, table layout, responsive behavior, fixture generation, formatting and implementation details within the existing contracts. They may implement backend CRUD/read queries already specified in the contract. They do not need approval for routine choices within those boundaries. An ambiguity goes to A/B; continue another independent task while awaiting the answer.

## Scope and time budget

Keep the implemented stack: React/Vite + Express/TypeScript + LOCAL PostgreSQL/Prisma, with the frozen API_CONTRACT.md. No migration to the alternate Next.js/Neon plan. This update changes Markdown assignments only, not schema, endpoint shapes or application code. Scaffold pages/501 handlers are still pending features, not completed work.

Planning window remains 09:00–16:15 IST, 435 minutes per full-day person. The earlier source says Monis leaves at 12:30; preserve that limit: 210 minutes from 09:00, with handoff by 12:15. Shift the schedule together if kickoff changes; do not silently extend Monis's availability. If kickoff is later than 09:00, A must recalculate every remaining budget before work begins; for example a 10:00 kickoff leaves B only 150 minutes and the others 375. Do not claim the estimates below fit that shorter window or silently extend B's availability. Reassign only noncritical implementation/QA to C/D, keep critical decisions with A/B, and explicitly record any required scope adjustment.

| Person | MUST budget | Available | Reserve | Delivery constraint |
|---|---|---|---|---|
| A | 395 min, including the 45-min foundation already delivered | 435 min | 40 min | Core backend and continuous PR review; no general feature-page implementation |
| B | 195 min | 210 min | 15 min | Domain + core billing tested and handed off by 12:15; available to 12:30 |
| C | 390 min | 435 min | 45 min | Own end-to-end catalog/report UI and integration fixes |
| D | 385 min | 435 min | 50 min | Own end-to-end operational UI, portal, seed and QA |

Estimates include Codex implementation and focused verification; green acceptance criteria, not elapsed time, determine completion. SHOULD/NICE only start after MUST work is accepted. Checkpoints: 11:30, 13:30, 15:30. Feature freeze 16:15; bug fixes until 16:45; record at 16:45; code freeze 17:00; video due 17:30 IST. At each checkpoint report actual remaining work and use the reserves; do not hide a missing feature by changing its priority.

## A — Lead: critical backend and integration (35%)

1. [x] **MUST · 45 min · FND-01** — Shared foundation: schema, initial migration, contracts/types, middleware/registries, shells, verified build/tests and local foundation commit/tag. Preserve local-only publication preference unless explicitly changed.
2. [ ] **MUST · 20 min · A-01** — With B, confirm the existing financial/security rules and public domain-service signatures. Publish the client session interface C can call and immutable test fixture IDs D can use. Resolve ambiguities centrally; no fresh architecture work for C/D.
3. [ ] **MUST · 50 min · A-02** — Auth/users backend and real requireAuth/requireRole: normalized email, bcrypt/JWT, active-user check, CUSTOMER-only signup, ADMIN-only staff creation, forgot/reset with hashed 30-min one-time token. Own client/src/lib/session.tsx and token wiring; C owns all auth/staff forms. Test duplicate email, invalid credentials, expired/reused reset token and production refusal of dev identity.
4. [ ] **MUST · 55 min · A-03** — Quotation-template + subscription backend: CRUD, copy template lines, price resolution, minimum quantity/availability, numbering and history. Call B's public state-machine/domain exports; validate relations and ownership. D owns every corresponding screen and typed client call.
5. [ ] **MUST · 60 min · A-04** — Invoice/payment backend: list/detail, confirm/cancel/send using D's email renderer, locked payment transaction, partial/full payment state, zero-total confirmation and overpayment rejection. Keep payment and cancellation invariants in server services. D implements payment forms, invoice views and printing.
6. [ ] **MUST · 25 min · A-05** — Integrate B's public billing/domain exports and C/D's service interfaces; any shared registry/type/config changes are A-owned. Wire shared dependencies without editing C/D-owned feature pages. Ensure each module imports public service exports only.
7. [ ] **MUST · 30 min · A-06** — Security/financial acceptance review: cross-customer reads, all mutation role guards, invoice/payment consistency, rollback and concurrency evidence from B. Review C's CRUD role use and D's portal ownership predicates; they fix implementation defects in their own folders.
8. [ ] **MUST · 60 min · A-07** — Review and integrate small PRs continuously, especially B before 12:30. Run checkpoints and inspect contract drift; C/D run routine regression/performance cases and supply evidence. A resolves architecture/schema/transaction conflicts.
9. [ ] **MUST · 50 min · A-08** — Final core-backend fixes, full real-data demo rehearsal with C/D, environment/migration readiness and technical signoff. Do not take back UI/seed work just because it is large; give C/D concrete defects to fix. Total MUST: 395 min.
10. [ ] **SHOULD · 20 min** — Auth/reset rate limits and operational failure reporting, preserving existing semantics.
11. [ ] **NICE · 20 min** — Bulk actions or extra endpoints, only after an explicit contract update and all MUST checks pass.

## B — Monis: domain and billing correctness (30%)

1. [ ] **MUST · 15 min · B-01** — Agree exact public signatures with A, read existing contract, establish domain fixtures and test setup. Add pure code under server/src/lib/domain and tests/domain; no Prisma inside pure functions.
2. [ ] **MUST · 30 min · B-02** — Money/price/tax helpers: integer paise or exact Decimal, half-up per-line tax, effective variant price exactly once, numeric bounds, tax snapshot input. Tests cover float traps, half-paise rounding and zero values.
3. [ ] **MUST · 25 min · B-03** — Anchored daily/weekly/monthly/yearly periods, month-end clamp and leap years, catch-up cap and inclusive expiry cutoff. Tests include Jan31→Feb→Mar31, Feb29 yearly and final clipped period.
4. [ ] **MUST · 30 min · B-04** — Discount eligibility and deterministic application; PRODUCT best saving, SUBSCRIPTION stacking, fixed caps, thresholds, dates/usage limits and no zero-saving consumption. Build invoice draft with frozen tax/discount lines and exact totals. Test every eligibility branch and a golden invoice calculation.
5. [ ] **MUST · 20 min · B-05** — Pure subscription/invoice transition tables + plan flags; give A allowedTransitions/canTransition exports and exhaustive valid/invalid pair tests. These helpers decide policy; A persists state/history.
6. [ ] **MUST · 50 min · B-06** — Billing service transaction and integration tests: lock subscription, ordered catch-up invoices, counter number, frozen lines, conditional discount usage, unique invoice period, atomic cursor advance, retry/isolation and hasMore. Prove repeated/parallel runs cannot double bill, usageLimit=1 is respected, failures roll back and paused/expired schedules follow the contract. Integration coverage is part of this task, not an optional extra.
7. [ ] **MUST · 15 min · B-07** — POST billing/run controller + daily node-cron to the same service, capped draining and catch-up-before-auto-close. Own server billing-engine routes/controller/service and scheduler file. A merges shared env/index/config wiring from B's precise handoff. No Vercel-only cron routes in this Express stack.
8. [ ] **MUST · 10 min · B-08** — By 12:15 update docs/status/B.md: exports, actual test commands/results, incomplete cases, local test DB setup, cron wiring and recovery notes. Handoff to A before 12:30; A owns critical post-handoff fixes. Total MUST: 195 min.
9. [ ] **SHOULD · 15 min** — Additional randomized calendar/property tests if core concurrency tests already pass.
10. [ ] **NICE · 15 min** — Preview-only calculations; new endpoint requires A's contract change.

## C — Adit Chobe: catalog, UI kit, auth screens and reporting (18%)

1. [ ] **MUST · 15 min · C-01** — Read frozen inputs/DTOs, create own branch, publish UI prop contract before building. Own all UI kit files after this handoff, including existing PageHeader/EmptyState; keep current public props compatible.
2. [ ] **MUST · 55 min · C-02** — Product/variant/plan backend CRUD from frozen validators: admin mutations/staff reads, deactivation, variant-product membership, effective-price display data, plan flags/minimum/dates and tax relation selection. Use A's guards/shared db; no invented pricing or lifecycle rules.
3. [ ] **MUST · 45 min · C-03** — Product+variant and plan list/form/detail pages with real API calls, pagination/search, client validation, loading/error/empty states, mutation feedback and responsive layouts. Demonstrate Brand=Odoo +560 without double counting.
4. [ ] **MUST · 30 min · C-04** — Discount CRUD service + admin screens: dates/thresholds/scope/product picker/usage display. usedCount is read-only. Call B's eligibility helper for derived labels if needed; never duplicate or alter financial application logic.
5. [ ] **MUST · 55 min · C-05** — Full reusable UI kit: controlled DataTable/Pagination, FormField with Zod field errors, StatusBadge, ConfirmDialog, Toast, PageHeader/EmptyState and UI prop documentation. Preserve existing exports; D integrates these in D's screens. Components do not fetch or aggregate whole tables.
6. [ ] **MUST · 50 min · C-06** — All login/signup/forgot/reset and staff/customer-list screens + typed client API calls. Match A's session interface and frozen password rules; live checklist, friendly conflicts/errors and correct role redirect. Security/token/reset persistence remains A-owned.
7. [ ] **MUST · 50 min · C-07** — Reports service using read-only SQL aggregates/groupBy, plus dashboard KPI cards, Recharts chart and date/status/customer/plan filters. Implement the exact frozen KPI definitions; ask A/B about ambiguity, never substitute financial definitions. No full-table JS reductions or static charts.
8. [ ] **MUST · 35 min · C-08** — Measure API/list/dashboard latency on D's 5,000-subscription seed, inspect query plans and document <2s evidence. Propose indexes to A; do not edit migrations/schema. Own reusable test/measurement harness and catalog/report tests.
9. [ ] **MUST · 55 min · C-09** — Own catalog/auth-screen/report/UI-kit QA and fixes across checkpoints. Review D's use of UI exports, supply compatibility fixes and rerun catalog/report regressions. Give A precise security/contract findings, with reproducible steps. Total MUST: 390 min.
10. [ ] **SHOULD · 20 min** — More list sort/filter controls and accessibility refinements.
11. [ ] **NICE · 20 min** — Extra chart breakdowns/CSV only after A approves any new API shapes.

## D — Ansh: operational screens, portal, seed, email and QA (17%)

1. [ ] **MUST · 15 min · D-01** — Read DTOs/roles and C's UI props, create own branch, prepare page skeletons against the existing routes. Keep 501/error states visible while services are pending; no fake success/data in product screens.
2. [ ] **MUST · 45 min · D-02** — Specified tax CRUD service + admin screens from frozen percentage/role rules. Add server email transport and pure password-reset/invoice HTML renderers; escape dynamic content. Dev logs work without SMTP; A calls the sender and controls reset/send semantics, tokens and sentAt.
3. [ ] **MUST · 40 min · D-03** — Quotation-template list/form/detail + template selector, product/variant line editor and typed API calls. Use A's service for subscription creation/expiry/price resolution; UI validation mirrors the contract.
4. [ ] **MUST · 60 min · D-04** — Subscription list/filter/form/detail with status timeline, readable tax/amount previews and allowed transition controls from A/B's policy output. Show server 409/422 errors; do not enforce lifecycle solely on the client. Own all subscription UI and its cache invalidation.
5. [ ] **MUST · 50 min · D-05** — Invoice list/filter/detail/print, billing-run page/result and payment form/list. Show paid/outstanding/overdue, partial payment feedback, confirm/cancel/send actions and print CSS. Use server totals/state, A's payment service and B's billing API; no client-side billing/payment calculations that authorize a write.
6. [ ] **MUST · 40 min · D-06** — Portal read-only service + summary/my-subscriptions/my-invoices/detail/print pages. Every DB query includes principal.id; reject foreign-owned IDs with 404 and never accept customerId. A reviews this security boundary; D implements/fixes it. Reuse D's invoice document component with authorized portal fetches.
7. [ ] **MUST · 50 min · D-07** — Complete idempotent demo/performance seed and fixtures: 1 admin, 2 staff, ~300 customers, 10 products+variants, 6 plans, taxes, 3 discounts, templates, ~5,000 subscriptions plus consistent invoices/payments. Own seed.ts and fixture generation; use B's exact money/draft helpers and A-approved IDs, never invent invoice math. --perf must opt in on a disposable local DB. C owns performance measurement, D owns the data.
8. [ ] **MUST · 30 min · D-08** — DEMO.md four-minute exact-click script + QA.md checklist/results. Execute auth→catalog→template→subscription→billing twice→discount→partial/full payment→dashboard→customer isolation. Record actual outcomes and route each defect to its owner; no external messages/issues without the user's authorization.
9. [ ] **MUST · 55 min · D-09** — Integrate C's kit into every D-owned screen, responsive/print/keyboard review, real-data end-to-end regression and D-owned fixes. Supply A a short acceptance report with screenshots/results if useful; repeat checks after fixes. Total MUST: 385 min.
10. [ ] **SHOULD · 20 min** — Better print layout and broader seed scenarios.
11. [ ] **NICE · 20 min** — Extra demo narrative, visual details or export polish; no backend policy changes.

## File ownership — explicit transfer, no overlaps

Server and client ownership are intentionally different: A/B build critical services while C/D build the labor-intensive screens. This table supersedes old owner comments in scaffold files and the previous unnamed A/B/C/D map. Application behavior/contracts stay unchanged. Nobody edits another person's existing file without an explicit transfer.

| Paths | Owner |
|---|---|
| Root manifests/lockfile/env/config; schema/migrations/prisma.config; API_CONTRACT.md; client/src/types/api.ts; README/TASKS/TEAM_PLAN | A, with B consulted on financial changes |
| server/src/lib/** except domain/** and email.ts; middleware/**; app.ts/index.ts; server module registry; client core lib/session/API/route registry/nav/layout/styles | A |
| server/src/modules/{auth,users,subscriptions,quotation-templates,invoices,payments}/** | A |
| server/src/lib/domain/**; server/src/modules/billing-engine/**; server/src/jobs/billing.ts; server/tests/{domain,billing}/** | B; A assumes urgent maintenance after the 12:30 handoff |
| server/src/modules/{products,plans,discounts,reports}/**; server/tests/{catalog,reports}/** | C |
| client/src/modules/{products,plans,discounts,reports,auth,users}/**; client/src/components/ui/** | C; existing PageHeader/EmptyState ownership transferred, public props preserved |
| server/src/modules/{taxes,portal}/**; server/src/lib/email.ts; server/prisma/seed.ts and seed-data/**; server/tests/{taxes,portal,seed}/** | D; A reviews portal ownership predicates and email integration |
| client/src/modules/{subscriptions,quotation-templates,invoices,billing-engine,payments,portal,taxes}/**; DEMO.md; QA.md | D |
| server/tests/foundation.test.ts; server/tests/{auth,subscriptions,invoices,payments}/** | A |
| Client tests inside an owned module; docs/status/A.md, B.md, C.md, D.md | Module owner; corresponding person only |

Only A changes shared dependency manifests/lockfile and existing core shared files. Others may add helper files within their owned paths. B's domain directory, D's email file and C's UI kit are explicit shared-folder ownership exceptions. Requests for a new module mount, session/route interface, package, field or validator go to A. The central server input validators remain A-owned; module schemas.ts re-export them.

## Dependencies and handoffs — do independent work immediately

| Consumer | Needs / producer | Needed by IST | Workaround until then |
|---|---|---|---|
| B/C/D | Frozen foundation and validator/DTO contract / A | Already delivered | Read contract; complete fixtures/components/tests against its real shapes |
| C/D | UI prop signatures / C | 09:30 | Accessible native controls plus compatible existing PageHeader/EmptyState |
| C | Verified session methods and staff API / A | Signature 09:30; service 11:30 | Build forms/API calls in C's modules; keep real pending/error states |
| A | Money, calendar and transition exports / B | 10:30 | Work auth/CRUD first; never write a second calculation/state policy |
| A | Billing service/tests/handoff / B | Core 11:30; complete 12:15 | Prepare invoice/payment services and direct test fixtures; A takes any documented remaining work before B leaves |
| D | Product/plan/discount CRUD / C | 11:30 | Build bounded line editors using contract types; local test fixtures only |
| A | Email function signatures/templates / D | Signatures 09:45; working 11:30 | A can complete token/state tests using an injected test sender |
| D | Templates/subscriptions/invoices/payments API / A | First endpoints 11:30; core 13:30 | Build all screens/typed calls; show honest 501/loading/error states, not fake product data |
| D | Billing API / B | 12:15 | Build run form/result view against BillingInput/BillingResult |
| C/D | Reusable UI implementation / C | Core components 11:30; full kit 13:30 | D continues with native inputs, then swaps components in D's own files |
| C | Deterministic small fixture seed / D | 11:30 | Seed isolated report test fixtures, no production UI JSON |
| C | Full 5,000-subscription seed / D | 13:30 | Build SQL measurement harness before bulk data is ready |
| A | Portal security proof, QA/demo outcomes / D; query timings / C | 15:30 | Review small PRs earlier; final signoff waits for actual evidence |

A merges small completed slices continuously. C/D fix their own integration bugs; A/B answer policy questions and review high-risk boundaries. No one is blocked from building screens, CRUD, tests or fixtures because a whole feature is not merged. At each checkpoint pull main when shared, migrate/seed a local DB, run typecheck/tests/build and the real-data smoke path. Keep the repository local until publication is explicitly authorized.

## Git, review and cut order

Use one branch per person: feat/A-core, feat/B-domain-billing, feat/C-catalog-reporting, feat/D-operations-ui. Each member uses their own Git account and commits a focused task every 30–45 min, then updates their own status note. When a shared remote is authorized, open small PRs and A merges; until then keep local branches and provide reviewable diffs. Do not push as part of this planning update.

Review depth follows risk: A/B approve schema/security/financial changes. Routine UI/CRUD implementation follows the frozen acceptance criteria and does not require A/B to make cosmetic choices. C may review D's UI kit usage; D may run C's regression cases. Cross-review does not transfer file ownership.

Cut extras first: CSV/animations/extra charts → optional preview/bulk actions → cosmetic refinements and additional fixture scenarios. Keep basic responsive/accessibility behavior and the 5,000-subscription performance proof. Do not offload architecture decisions to C/D to meet a deadline. If the budget slips, A explicitly redistributes routine implementation/QA within C/D's reserve and takes unfinished critical work at B's handoff; record changed owners before editing.

Never cut uniqueness/idempotency, transactional cursor/discount/payment updates, frozen tax snapshots, server role/ownership checks, money/date/state correctness, core regression tests, real dynamic data, local PostgreSQL, or required reset/email/print/report features.
