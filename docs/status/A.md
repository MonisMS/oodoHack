# Person A status

## Foundation delivered

- Full Prisma schema: all required models/enums/relations, Counter, subscription history, financial indexes and unique(subscriptionId,periodStart).
- Initial PostgreSQL migration generated, including database CHECK constraints for money, dates, quantity, normalized email and discounts.
- API_CONTRACT.md contains the endpoint inventory, exact Zod inputs, DTO mirror, service export signatures and billing/state/security decisions.
- Express error/validation middleware, explicit opt-in dev auth, module registry, numbering helper, Vite/React shell, role navigation, fetch client and all module routes.
- README.md ownership map/setup/integration rules; TASKS.md priority checklists, budgets, dependencies and cut list.
- Feature handlers intentionally return 501; no B/C/D feature implementation. seed.ts does not write data. Billing scheduler remains disabled.

## Verification (2026-10-31)

- `npm run db:generate`: passed on Prisma 7.10.1.
- `npm run db:validate -w server`: passed.
- `npm run typecheck`: passed for client + server (tests/seed/config included).
- `npm test`: 12 foundation boundary/input tests passed.
- `npm run build`: Express TypeScript output and Vite production bundle passed.
- `npm audit --audit-level=moderate`: zero vulnerabilities reported.
- `git diff --cached --check`: passed before foundation commit.

## Remaining verification and handoff

Ownership update: the current TASKS.md / docs/TEAM_PLAN.md supersedes the original A/B/C/D handoff allocation below. This status records the foundation snapshot; the rebalanced plan retains A/B decision authority.

- Local PostgreSQL is not installed in this WSL distro, and no local Docker socket is available. Migration SQL was generated/inspected, not applied to a live database. Use README setup, then npm run db:migrate; feature owners must run their financial/concurrency integration tests against an isolated local test database.
- No business seed/demo logins exist until D implements the seed.
- C receives auth.ts + client session.tsx behind their existing interfaces. B receives new UI kit files; A retains PageHeader/EmptyState. D receives seed.ts. Shared root dependency/lockfile edits go through A.
- Contract or schema changes after foundation-v1 go through A with migrations and synchronized DTO/validator updates.

## Progress (2026-10-31)

- **A-02 done** (branch `feat/A-core`, pushed): Better Auth cookie sessions, real requireAuth/requireRole, active-user check, CUSTOMER-only signup, ADMIN-only staff creation, users listing, client `useSession()`, password policy hook, reset flow; 29 tests incl. production guards. Reset token is stored by Better Auth (Verification table), not SHA-256 hashed as the old contract said.
- **A-01 in progress** (branch `feat/A-01-contracts`): session interface published, fixture IDs in `server/src/lib/fixtures.ts`, domain signatures proposed in `docs/A-01-agreements.md` — waiting for Monis (B) to confirm section 3.
- Local test DB: tests run with `TEST_DATABASE_URL` pointing at a disposable local PostgreSQL (skipped otherwise).
- **A-03 done** (branch `feat/A-03-subscriptions`, not yet pushed): quotation-template CRUD (DELETE deactivates), subscription list/get/create/from-template/replace/delete/transition. Price resolution = product + variant extra exactly once, explicit price final, frozen on the line; plan window/min-quantity/customer/catalog validation; SUB numbers from Counter (parallel-safe); row-locked transitions writing SubscriptionEvent with actor/reason; renewal keeps nextInvoiceDate. Responses add `allowedTransitions` for the UI. 17 integration tests (50 total).
- **Stand-in for B:** `server/src/modules/subscriptions/rules.ts` implements the contract's transition table with the signature proposed in docs/A-01-agreements.md. When B's `lib/domain/states.ts` lands, change the import in `service.ts` and delete `rules.ts` (tests stay valid).
- **A-04 done** (branch `feat/A-04-invoices-payments`, not yet pushed): invoice list/get/confirm/cancel/send and payment list/record. Row-locked transitions with re-read under the lock; payments re-aggregated under the lock (never trusting cached amountPaid), overpayment/future date rejected, status flips PARTIALLY_PAID/PAID atomically; zero-total invoice settles on confirm; cancel blocked once payments exist; send sets `sentAt` only after the transport succeeds (502 EMAIL_FAILED otherwise, production fails honestly without SMTP). Invoice responses add `outstanding` and `overdue`. 15 integration tests incl. concurrent payments (65 total).
- **Stand-ins until others land:** `modules/invoices/rules.ts` (B's `canTransitionInvoice`) and `modules/invoices/mailer.ts` (D-02's SMTP sender + HTML renderer). Swap imports when theirs merge. `toInvoiceDto`/`invoiceInclude` are exported for the portal (D) to reuse; the portal must add its own `customerId = principal.id` filter.
- Shared helpers added: `lib/dates.ts`, `lib/locks.ts` (`lockRow`).
- **A-06 (own code) + hardening done** (branch `feat/A-06-security-hardening`, not yet pushed). Executable review: contract-driven sweep proving every non-auth endpoint rejects anonymous (401) and wrong-role (403) callers; Better Auth `update-user`/`change-email`/`delete-user` cannot escalate or take over accounts; no password hashes/provider secrets in responses; generic errors. **Finding fixed:** Better Auth only checked `Origin` when a cookie was present, leaving login CSRF open; `originGuard` now runs before `/api/auth` and on every state-changing `/api` call. Auth rate limits (sign-in 8/min, sign-up 5/min, reset-request 3/min, reset 5/min, tested with real 429s). CORS restricted to allowed origins. 79 tests total.
- **A-08 readiness (first half) verified:** fresh DB migrates, compiled server boots in production, unsafe config refused, dev headers rejected. See README "Production notes".
- **Still open for A-06:** Chobe's role use and Ansh's portal ownership predicates (not written yet). The portal must filter by `customerId = principal.id`; the contract-sweep test will cover its routes automatically once they return real data.
- **A-10 safety hardening done** (branch `feat/A-10-safety-hardening`, based on main with Monis's billing): attacks found by adversarial probing are fixed and covered by tests - dev identity off by default and loopback-only, API binds to 127.0.0.1, forged X-Forwarded-For cannot bypass rate limits, deactivation revokes sessions (new `PUT /api/users/:id`), NUL characters rejected (was 500), line/subscription total caps, date bounds, business-calendar "today" (Asia/Kolkata) for payments/overdue/transitions, payment not before invoice issue date, client treats inactive users as signed out and no longer bounces to /login while loading. 161 tests green with all three database suites.
- Accepted risk, not changed: sign-up reveals whether an email is registered (standard trade-off; reset flow is already neutral).

