# API contract — foundation v1

Contract editor: Lead (A), with Monis (B) retaining financial/domain decision authority. Ownership follows TASKS.md; C is Adit Chobe and D is Ansh. Frozen when the verified foundation commit is shared. Schema or contract changes go through A and include a migration if needed. This contract describes the target implementation; foundation feature handlers intentionally return 501.

## Transport and access

- Base `/api`; JSON request/response; no trailing slash required. IDs are UUIDs. Dates are UTC calendar `YYYY-MM-DD`; timestamps are ISO 8601 UTC. One currency, INR. Money uses major-unit decimal strings with exactly two digits (`"560.00"`), never JSON floats; percentage strings have up to four decimal places. Internally calculate in integer paise or exact Decimal, round half up per line, and check numeric bounds before saving.
- **Auth = Better Auth (cookie sessions), replaces the earlier JWT/bcrypt design.** Session cookie `better-auth.session_token`, 8-hour expiry, same-origin via the Vite `/api` proxy; client fetches use `credentials: 'include'`. `requireAuth` reads the session and rejects deactivated users (`User.isActive=false`) on every request. Signup always creates an active CUSTOMER (`role`/`isActive` are server-owned, client input is ignored); only ADMIN creates STAFF, through the server helper `createCredentialUser` (also used by the seed so seeded logins hash like real ones). Password policy (>8 chars, upper, lower, special, max 72) is enforced by a server hook on signup, reset and change. Email is lowercased by Better Auth. Logout deletes the server session. Passwords are scrypt-hashed in `Account.password` (providerId `credential`).
- Until A replaces `server/src/middleware/auth.ts`, dev auth requires `DEV_AUTH_ENABLED=true`, UUID `x-dev-user-id` and enum `x-dev-role`. It is refused in production, provides no real authentication, and must only run on a trusted development machine. Both `requireAuth` and `requireRole(...roles)` retain their signatures and set `req.user: {id, role}`.
- Roles in the endpoint table are exhaustive. No implicit ADMIN override for CUSTOMER-only portal routes. Portal services derive customerId only from the principal and apply it in EVERY list/detail query. A missing or foreign-owned portal record returns 404. No customer filter is accepted on portal queries.
- List response is `{data: T[], page: number, pageSize: number, total: number}`. Other JSON success responses use `{data: T}`. DELETE/logout return 204 with no body. PUT is complete replacement of writable fields, not PATCH. Omitted optional fields receive the documented Zod defaults. Relations and immutable server-managed values never come from request bodies.
- All errors: `{error: {code: string, message: string, fields?: Record<string,string[]>}}`. Status codes: 400 INVALID_JSON; 401 UNAUTHENTICATED / INVALID_CREDENTIALS / INVALID_RESET_TOKEN; 403 FORBIDDEN; 404 NOT_FOUND; 409 CONFLICT / INVALID_TRANSITION / RELATION_CONFLICT / LIMIT_REACHED; 413 PAYLOAD_TOO_LARGE; 422 VALIDATION_ERROR; 501 NOT_IMPLEMENTED; 500 INTERNAL_ERROR. Do not leak hashes/tokens/stack traces. Expired/used reset tokens are invalid. Forgot-password always returns the same neutral success, including unknown emails.
- Query defaults page=1/pageSize=20, pageSize max=100. Search is case-insensitive literal substring on names/numbers (escape SQL LIKE metacharacters in raw SQL). Date filters inclusive; reject from > to. Invoice filter dates use issueDate, payment filters use payment.date. Sorting is allowlisted: all lists support createdAt; users/products/plans/taxes/discounts/templates support name; subscriptions support number,nextInvoiceDate; invoices support number,dueDate; payments support date. Unsupported sort returns 422. Add id as a stable secondary sort. Pagination, filtering, sorting, count and report aggregation run in PostgreSQL, never load all records into JS.

## Endpoint inventory

All request shapes are named Zod schemas reproduced below. `—` means no body/query/params. Empty bodies on actions are ignored; no input is read from them. Responses reference exact DTOs reproduced below. Business/resource existence validation belongs in services after Zod validation. List/detail responses use the same DTO shapes, including the listed children; keep children bounded (max 100 editable lines). Payment/history arrays can grow; if measurements warrant paginating them, A must version the contract first.

| Method | Path | Roles | Body | Query | Params | Success |
|---|---|---|---|---|---|---|
| GET | /api/health | public | — | — | — | 200 Data<{status:"ok",scope:"foundation"}> |
| POST | /api/auth/sign-up/email | public | `{name,email,password}` | — | — | 200 `{token,user}` + session cookie (Better Auth) |
| POST | /api/auth/sign-in/email | public | `{email,password}` | — | — | 200 + session cookie; 401 on bad credentials |
| POST | /api/auth/sign-out | any signed-in | — | — | — | 200, session deleted |
| GET | /api/auth/get-session | public | — | — | — | 200 `{session,user:{id,name,email,role,isActive}}` or `null` |
| POST | /api/auth/request-password-reset | public | `{email,redirectTo}` | — | — | 200 neutral message, identical for unknown emails; link = `<redirectTo>?token=…` |
| POST | /api/auth/reset-password | public | `{token,newPassword}` | — | — | 200; token one-time, 30 min, revokes other sessions |
| GET | /api/users/customers | ADMIN, STAFF | — | customerQuery | — | 200 Page<User> |
| GET | /api/users/staff | ADMIN | — | listQuery | — | 200 Page<User> |
| POST | /api/users/staff | ADMIN | staffInput | — | — | 201 Data<User> |
| GET | /api/products | ADMIN, STAFF | — | listQuery | — | 200 Page<Product> |
| POST | /api/products | ADMIN | productInput | — | — | 201 Data<Product> |
| GET | /api/products/:id | ADMIN, STAFF | — | — | idParams | 200 Data<Product> |
| PUT | /api/products/:id | ADMIN | productInput | — | idParams | 200 Data<Product> |
| DELETE | /api/products/:id | ADMIN | — | — | idParams | 204 empty |
| POST | /api/products/:id/variants | ADMIN | variantInput | — | idParams | 201 Data<ProductVariant> |
| PUT | /api/products/:id/variants/:variantId | ADMIN | variantInput | — | variantParams | 200 Data<ProductVariant> |
| DELETE | /api/products/:id/variants/:variantId | ADMIN | — | — | variantParams | 204 empty |
| GET | /api/plans | ADMIN, STAFF | — | listQuery | — | 200 Page<Plan> |
| POST | /api/plans | ADMIN | planInput | — | — | 201 Data<Plan> |
| GET | /api/plans/:id | ADMIN, STAFF | — | — | idParams | 200 Data<Plan> |
| PUT | /api/plans/:id | ADMIN | planInput | — | idParams | 200 Data<Plan> |
| DELETE | /api/plans/:id | ADMIN | — | — | idParams | 204 empty |
| GET | /api/taxes | ADMIN, STAFF | — | listQuery | — | 200 Page<Tax> |
| POST | /api/taxes | ADMIN | taxInput | — | — | 201 Data<Tax> |
| GET | /api/taxes/:id | ADMIN, STAFF | — | — | idParams | 200 Data<Tax> |
| PUT | /api/taxes/:id | ADMIN | taxInput | — | idParams | 200 Data<Tax> |
| DELETE | /api/taxes/:id | ADMIN | — | — | idParams | 204 empty |
| GET | /api/discounts | ADMIN, STAFF | — | listQuery | — | 200 Page<Discount> |
| POST | /api/discounts | ADMIN | discountInput | — | — | 201 Data<Discount> |
| GET | /api/discounts/:id | ADMIN, STAFF | — | — | idParams | 200 Data<Discount> |
| PUT | /api/discounts/:id | ADMIN | discountInput | — | idParams | 200 Data<Discount> |
| DELETE | /api/discounts/:id | ADMIN | — | — | idParams | 204 empty |
| GET | /api/quotation-templates | ADMIN, STAFF | — | listQuery | — | 200 Page<QuotationTemplate> |
| POST | /api/quotation-templates | ADMIN, STAFF | templateInput | — | — | 201 Data<QuotationTemplate> |
| GET | /api/quotation-templates/:id | ADMIN, STAFF | — | — | idParams | 200 Data<QuotationTemplate> |
| PUT | /api/quotation-templates/:id | ADMIN, STAFF | templateInput | — | idParams | 200 Data<QuotationTemplate> |
| DELETE | /api/quotation-templates/:id | ADMIN, STAFF | — | — | idParams | 204 empty |
| GET | /api/subscriptions | ADMIN, STAFF | — | subscriptionQuery | — | 200 Page<Subscription> |
| POST | /api/subscriptions | ADMIN, STAFF | subscriptionInput | — | — | 201 Data<Subscription> |
| POST | /api/subscriptions/from-template | ADMIN, STAFF | fromTemplateInput | — | — | 201 Data<Subscription> |
| GET | /api/subscriptions/:id | ADMIN, STAFF | — | — | idParams | 200 Data<Subscription> |
| PUT | /api/subscriptions/:id | ADMIN, STAFF | subscriptionInput | — | idParams | 200 Data<Subscription> |
| DELETE | /api/subscriptions/:id | ADMIN, STAFF | — | — | idParams | 204 empty |
| POST | /api/subscriptions/:id/transition | ADMIN, STAFF | transitionInput | — | idParams | 200 Data<Subscription> |
| GET | /api/invoices | ADMIN, STAFF | — | invoiceQuery | — | 200 Page<Invoice> |
| GET | /api/invoices/:id | ADMIN, STAFF | — | — | idParams | 200 Data<Invoice> |
| POST | /api/invoices/:id/confirm | ADMIN, STAFF | — | — | idParams | 200 Data<Invoice> |
| POST | /api/invoices/:id/cancel | ADMIN, STAFF | — | — | idParams | 200 Data<Invoice> |
| POST | /api/invoices/:id/send | ADMIN, STAFF | — | — | idParams | 200 Data<Invoice> |
| POST | /api/billing/run | ADMIN, STAFF | billingInput | — | — | 200 Data<BillingResult> |
| GET | /api/payments | ADMIN, STAFF | — | paymentQuery | — | 200 Page<Payment> |
| POST | /api/payments | ADMIN, STAFF | paymentInput | — | — | 201 Data<Payment> |
| GET | /api/reports/summary | ADMIN, STAFF | — | reportQuery | — | 200 Data<ReportSummary> |
| GET | /api/portal/summary | CUSTOMER | — | — | — | 200 Data<PortalSummary> |
| GET | /api/portal/subscriptions | CUSTOMER | — | portalSubscriptionQuery | — | 200 Page<Subscription> |
| GET | /api/portal/subscriptions/:id | CUSTOMER | — | — | idParams | 200 Data<Subscription> |
| GET | /api/portal/invoices | CUSTOMER | — | portalInvoiceQuery | — | 200 Page<Invoice> |
| GET | /api/portal/invoices/:id | CUSTOMER | — | — | idParams | 200 Data<Invoice> |

## Lifecycle and business invariants

### Catalog, templates and subscription editing

Product/plan/tax/discount DELETE deactivates (`isActive=false`), retaining all financial references. Variant DELETE also deactivates. Template DELETE deactivates; subscriptions created from it remain intact. Subscription DELETE is a hard delete allowed only in DRAFT with no invoices; otherwise 409. Inactive catalog entries cannot be selected for new lines/subscriptions. Historical records keep their references.

Variant must belong to the line product. Missing unitPrice resolves to product.salesPrice + variant.extraPrice, exactly once, then freezes on the subscription line. An explicitly supplied unitPrice is the final effective price and never gets the variant extra added again. Every line must be nonnegative. Plan.price is a separate once-per-period plan-fee invoice line, not multiplied by product quantities. Selected active taxes on a plan apply to that fee; active product taxes apply to product charges. Multiple rates add independently on each base (no compounding).

Subscription create is DRAFT, nextInvoiceDate=startDate, billingAnchorDay/month from startDate; customer must have role CUSTOMER and be active. Total product quantity must meet plan.minQuantity. Start must lie within plan availability (inclusive). Expiry cannot precede start. Only DRAFT/QUOTATION subscriptions may be edited; server recomputes schedule/anchor when start changes and always validates all relations. Template creation copies lines, resolves missing prices, sets expiryDate = startDate + validityDays UTC days and nextInvoiceDate=startDate. In v1 validityDays intentionally determines subscription expiry; no second quotation-validity field. Template lines are independent copies after creation.

### Subscription state machine (any unlisted pair → 409)

| From | To | Condition |
|---|---|---|
| DRAFT | QUOTATION | Valid lines, customer and available plan |
| QUOTATION | CONFIRMED | Same validation |
| CONFIRMED | ACTIVE | Same validation; start may be future (billing waits) |
| ACTIVE | PAUSED | plan.pausable |
| PAUSED | ACTIVE | plan.pausable; expiry absent or not yet passed |
| DRAFT / QUOTATION / CONFIRMED | CLOSED | Cancellation before activation |
| ACTIVE / PAUSED | CLOSED | expiry passed OR plan.closableEarly |
| CLOSED | ACTIVE | plan.renewable, renewalExpiryDate required, later than old expiry and current UTC date |

Transition uses a transaction, locks/rechecks current status, writes SubscriptionEvent. ActorId is the authenticated staff/admin (null for cron). Same-state transitions are 409. Renewal preserves the existing nextInvoiceDate/anchor, extending the schedule rather than resetting and risking duplicate periods. PAUSED holds billing execution, not the schedule: resuming catches up all unbilled periods, including the pause interval. This is an explicit v1 decision; changing pause to waive charges requires A to change the contract.

### Billing, taxes and discounts

`runBilling({asOfDate,maxPeriodsPerSubscription=24})` finds ACTIVE subscriptions with nextInvoiceDate <= asOfDate. Per subscription use ONE transaction, row-lock subscription, recheck eligibility, and generate every due period in order up to the cap. Skip PAUSED/CLOSED and future starts. Periods are `[periodStart, periodEnd)`; bill if periodStart <= expiryDate (expiry inclusive). Clip final periodEnd to expiry+1 day, with full-period charges, no proration. Compute next boundary from the original anchor: Jan 31 → Feb 28/29 → Mar 31; leap Feb 29 returns on leap years. Never derive subsequent months only from the clamped February day. Advance nextInvoiceDate to the next natural boundary even for a clipped final period.

Within that same transaction: create numbered invoice and immutable lines/customer snapshot, increment eligible discount counters and create DiscountUsage records, then advance nextInvoiceDate. Use `nextNumber(tx,'INV',year)` and `nextNumber(tx,'SUB',year)`, never count+1. Invoice issueDate=asOfDate; dueDate=issueDate+paymentTermsDays. SQL unique(subscriptionId,periodStart) is mandatory. Concurrent runs lock subscriptions and use conditional atomic discount increments; serialize/retry deadlocks and Prisma P2034 boundedly. A P2002 invoice-period collision rolls back the whole subscription transaction and is reported skipped only after rereading confirms another committed run advanced the cursor; other unique errors are failures, not silently swallowed. Failed subscriptions roll back invoices/counters/cursor and do not stop others.

Max 24 catch-up periods by default prevents an unbounded transaction. Return hasMore when eligible periods remain; repeated runs drain them. created counts invoices; skipped counts subscriptions which create none after recheck; failed counts failed subscriptions; autoClosed counts subscriptions closed. B implements a daily node-cron UTC job that invokes this same service, logs failures, and drains hasMore in bounded batches. Cron may only auto-close an expired autoClose subscription after ALL due periods through expiry are billed; never close first and lose historical charges. Configure scheduler in B's billing task with A's shared startup integration (currently disabled).

Tax per charge line: round-half-up(quantity × unitPrice × percentage / 100) for each tax. Save `{taxId,name,percentage,amount}` snapshots on InvoiceLine.taxes; changes to product prices/tax rules/discounts/customer names cannot mutate old invoices. No invoice line editing API in v1.

Discount eligibility uses active flag, inclusive startsAt/endsAt vs periodStart, current usedCount < usageLimit, pre-discount/pre-tax eligible subtotal >= minPurchase, and eligible product quantity >= minQuantity. Product scope considers matching product charges only; subscription scope includes the plan fee and all charges (quantity threshold still uses product quantities). PRODUCT rules: select the largest saving per product line, ties by discount UUID ascending. Aggregate each selected rule into one separate negative line. SUBSCRIPTION rules stack by UUID ascending on the remaining subtotal after product discounts. Fixed savings are capped to eligible remaining subtotal; percentage uses half-up paise rounding. No negative invoice total. V1 discounts are post-tax commercial rebates: they reduce the amount due but do not change charge tax snapshots. This is a frozen hackathon convention. discountTotal is a positive magnitude; negative discount lines have taxTotal=0 and taxes=[]. Invoice subtotal=sum CHARGE subtotals, taxTotal=sum CHARGE tax totals, total=subtotal+taxTotal-discountTotal (also sum of all line totals). A rule with zero saving is not consumed.

Count a discount once per invoice regardless of matching lines. DiscountUsage unique(discountId,invoiceId) prevents double consumption. Reserve usage with a conditional SQL UPDATE including usageLimit in the predicate, in the invoice transaction. Lock discount rows in UUID order to avoid deadlocks; if another subscription exhausts the rule, recalculate without it before saving lines. usedCount is read-only and cannot be supplied via API. Cancelled invoices retain usage history and do not refund usage in v1.

### Invoices and payments

Invoice state transitions: DRAFT→CONFIRMED or CANCELLED; CONFIRMED→CANCELLED only if no payments; payment moves CONFIRMED→PARTIALLY_PAID→PAID (or CONFIRMED→PAID directly). No transitions out of PAID/CANCELLED. A zero-total invoice becomes PAID on confirm. Confirm/cancel on invalid states return 409. Send only CONFIRMED/PARTIALLY_PAID/PAID, via email HTML generated from frozen values; set sentAt only after send succeeds. Dev may log email content; production SMTP errors must fail the action. Print is a client route using the same authorized invoice detail API, no unauthenticated PDF URL.

Payments have positive amount <= outstanding and only target CONFIRMED/PARTIALLY_PAID. Lock invoice in a transaction, aggregate/recheck payments, insert payment with recordedById=principal.id, update amountPaid and status atomically. No payment edits/deletes in v1. outstanding=total-amountPaid only for CONFIRMED/PARTIALLY_PAID. Overdue additionally dueDate < current UTC date; exclude DRAFT/CANCELLED/PAID. Recorded payment.date cannot be in the future. Returning Data<Payment> requires invalidating invoice detail/list and reports on the client.

Reports: all filters are combined. Subscription count uses current subscription status (and startDate within range when provided). Financial invoice KPIs use issueDate range + linked subscription/customer/plan/status filters; revenueCollected and revenueByMonth sum payments by payment.date within range (not invoice issueDate) plus the same linked filters. outstanding and overdue KPIs use only confirmed/partially-paid invoices; revenue never sums invoice totals. Monthly buckets are YYYY-MM UTC, ordered ascending. Empty metrics are "0.00"/0 and empty chart []. Use SQL aggregates/groupBy with indexed predicates, no JS full-table reduce. Target list+dashboard <2 s at 5,000 subscriptions; D records measurements and asks A for additional indexes if necessary.

### Auth/reset details

Reset (Better Auth): `sendResetPassword` calls `resetMailer.send` in `server/src/lib/auth.ts` (D-02 swaps the dev console log for SMTP and must fail the request in production). Token lives in `Verification`, expires in 30 minutes, is single use, and a successful reset revokes all sessions. Unknown emails get the same neutral response. Frontend reset page reads `?token=` and calls `reset-password`. Rate limiting is Better Auth's built-in production limiter.

## Server service boundaries (target exports; not implemented in foundation)

Controllers read `res.locals.validated.{body,query,params}`, pass only parsed input plus principal, and return the envelopes above. Each owner implements exports in their own module's service.ts. Other modules may import these public exports only, never controllers, schemas, or private helpers. A owns the database singleton and transaction-aware shared helpers. C's reports use direct read-only aggregate queries through db. A owns critical subscription/invoice/payment/auth services; B owns pure domain and billing services; C owns specified catalog/discount/report services; D owns specified tax/portal services and email/seed implementation.

```ts
// Inputs/DTOs refer to the exact transport types below. Role checks remain on routes AND sensitive services.
// All exports return Promise<DTO> (or Promise<void>); no response envelopes inside services.
// CRUD convention for products/plans/taxes/discounts/quotation-templates:
list(query: ListQuery, actor: Principal): Promise<Page<Resource>>
get(id: string, actor: Principal): Promise<Resource>
create(input: ResourceInput, actor: Principal): Promise<Resource>
replace(id: string, input: ResourceInput, actor: Principal): Promise<Resource>
remove(id: string, actor: Principal): Promise<void>
// Product module additionally:
createVariant(productId: string, input: VariantInput, actor: Principal): Promise<ProductVariant>
replaceVariant(productId: string, variantId: string, input: VariantInput, actor: Principal): Promise<ProductVariant>
removeVariant(productId: string, variantId: string, actor: Principal): Promise<void>
// Auth A: Better Auth handles signup/login/session/reset at /api/auth/*; no service exports here.
// Client screens (C) use useSession() from client/src/lib/session.tsx. Server code needing a user with a
// credential login (staff, seed) calls createCredentialUser() from server/src/lib/auth.ts.
// User module A (C implements client screens):
listCustomers(query: ListQuery, actor: Principal): Promise<Page<User>>
listStaff(query: ListQuery, actor: Principal): Promise<Page<User>>
createStaff(input: StaffInput, actor: Principal): Promise<User>
// Subscriptions A:
list(query: SubscriptionQuery, actor: Principal): Promise<Page<Subscription>>
get(id: string, actor: Principal): Promise<Subscription>
create(input: SubscriptionInput, actor: Principal): Promise<Subscription>
replace(id: string, input: SubscriptionInput, actor: Principal): Promise<Subscription>
remove(id: string, actor: Principal): Promise<void>
createFromTemplate(input: FromTemplateInput, actor: Principal): Promise<Subscription>
transition(id: string, input: TransitionInput, actor: Principal): Promise<Subscription>
// Billing B: HTTP route performs role guard; scheduler supplies no impersonated user.
runBilling(input: BillingInput): Promise<BillingResult>
// Pure helpers use integer paise (safe integers); fractional rates use decimal strings.
computeLineTax(baseMinor: number, percentage: string): number
findApplicableDiscounts(discounts: Discount[], context: {
  periodStart: DateOnly; productId: Id | null; quantity: number; subtotalMinor: number
}): Discount[]
// Invoices A:
list(query: InvoiceQuery, actor: Principal): Promise<Page<Invoice>>
get(id: string, actor: Principal): Promise<Invoice>
confirm(id: string, actor: Principal): Promise<Invoice>
cancel(id: string, actor: Principal): Promise<Invoice>
send(id: string, actor: Principal): Promise<Invoice>
// Payments A / reports C:
list(query: PaymentQuery, actor: Principal): Promise<Page<Payment>>
recordPayment(input: PaymentInput, actor: Principal): Promise<Payment>
summary(query: ReportQuery, actor: Principal): Promise<ReportSummary>
// Portal D (A reviews the ownership boundary); customer derived from actor in every export:
summary(actor: Principal): Promise<PortalSummary>
listSubscriptions(query: PortalSubscriptionQuery, actor: Principal): Promise<Page<Subscription>>
getSubscription(id: string, actor: Principal): Promise<Subscription>
listInvoices(query: PortalInvoiceQuery, actor: Principal): Promise<Page<Invoice>>
getInvoice(id: string, actor: Principal): Promise<Invoice>
```

## Exact request Zod shapes

Canonical file: `server/src/lib/contracts.ts`. Module schemas.ts files re-export it; nobody copies or forks server validators. Defaults apply when keys are omitted, nullable means explicit null is accepted. .strict() rejects unknown keys.

```ts
import { z } from 'zod';

export const role = z.enum(['ADMIN', 'STAFF', 'CUSTOMER']);
export const subscriptionStatus = z.enum(['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED']);
export const invoiceStatus = z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']);
export const paymentMethod = z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD']);
export const id = z.string().uuid();
export const idParams = z.object({ id }).strict();
export const variantParams = z.object({ id, variantId: id }).strict();
// Transport money in major currency units, never floating point JSON numbers.
export const money = z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/, 'Use a nonnegative decimal string with two places');
export const positiveMoney = money.refine(v => Number(v) > 0, 'Must be greater than zero');
export const percentage = z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/).refine(v => Number(v) <= 100, 'Maximum is 100');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Use a real calendar date YYYY-MM-DD');
export const password = z.string().min(9).max(72).regex(/[A-Z]/, 'Needs uppercase').regex(/[a-z]/, 'Needs lowercase').regex(/[^A-Za-z0-9\s]/, 'Needs a special character').refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Maximum bcrypt input is 72 bytes');
const name = z.string().trim().min(1).max(120);
const title = z.string().trim().min(1).max(160);
const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const note = z.string().max(4000);
const ids = z.array(id).max(100).refine(v => new Set(v).size === v.length, 'IDs must be unique');
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).optional(), sortBy: z.enum(['createdAt', 'name', 'number', 'dueDate', 'nextInvoiceDate', 'date']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export const customerQuery = listQuery.extend({});
export const subscriptionQuery = listQuery.extend({ status: subscriptionStatus.optional(), customerId: id.optional(), planId: id.optional() });
export const invoiceQuery = listQuery.extend({ status: invoiceStatus.optional(), customerId: id.optional(), planId: id.optional(), from: date.optional(), to: date.optional(), overdue: z.enum(['true','false']).optional() });
export const portalSubscriptionQuery = listQuery.extend({ status: subscriptionStatus.optional() });
export const portalInvoiceQuery = listQuery.extend({ status: invoiceStatus.optional(), overdue: z.enum(['true','false']).optional() });
export const paymentQuery = listQuery.extend({ invoiceId: id.optional(), customerId: id.optional(), method: paymentMethod.optional(), from: date.optional(), to: date.optional() });
export const reportQuery = z.object({ from: date.optional(), to: date.optional(), customerId: id.optional(), planId: id.optional(), status: subscriptionStatus.optional() }).strict().refine(v => !v.from || !v.to || v.from <= v.to, { message: 'from must be <= to', path: ['to'] });
export const signupInput = z.object({ name, email, password }).strict();
export const loginInput = z.object({ email, password: z.string().min(1).max(256) }).strict();
export const forgotPasswordInput = z.object({ email }).strict();
export const resetPasswordInput = z.object({ token: z.string().min(32).max(256), password }).strict();
export const staffInput = signupInput;
export const variantInput = z.object({ attribute: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(80), extraPrice: money, isActive: z.boolean().default(true) }).strict();
export const productInput = z.object({ name: title, type: z.enum(['SERVICE','DIGITAL','PHYSICAL']), salesPrice: money, costPrice: money, notes: note.nullable().optional(), isActive: z.boolean().default(true), taxIds: ids.default([]) }).strict();
export const planInput = z.object({ name: title, price: money, billingPeriod: z.enum(['DAILY','WEEKLY','MONTHLY','YEARLY']), minQuantity: z.number().int().min(1), availableFrom: date.nullable().default(null), availableTo: date.nullable().default(null), autoClose: z.boolean(), closableEarly: z.boolean(), pausable: z.boolean(), renewable: z.boolean(), isActive: z.boolean().default(true), taxIds: ids.default([]) }).strict().refine(v => !v.availableFrom || !v.availableTo || v.availableFrom < v.availableTo, { path: ['availableTo'], message: 'Must be after availableFrom' });
export const taxInput = z.object({ name: z.string().trim().min(1).max(100), percentage, isActive: z.boolean().default(true), productIds: ids.default([]), planIds: ids.default([]) }).strict();
export const discountInput = z.object({ name, type: z.enum(['FIXED','PERCENTAGE']), scope: z.enum(['PRODUCT','SUBSCRIPTION']), value: positiveMoney, minPurchase: money.nullable().default(null), minQuantity: z.number().int().min(1).nullable().default(null), startsAt: date, endsAt: date.nullable().default(null), usageLimit: z.number().int().min(1).nullable().default(null), isActive: z.boolean().default(true), productIds: ids.default([]) }).strict()
  .refine(v => v.type !== 'PERCENTAGE' || Number(v.value) <= 100, { path: ['value'], message: 'Percentage maximum is 100' })
  .refine(v => !v.endsAt || v.startsAt <= v.endsAt, { path: ['endsAt'], message: 'Must be on or after startsAt' })
  .refine(v => v.scope === 'PRODUCT' ? v.productIds.length > 0 : v.productIds.length === 0, { path: ['productIds'], message: 'Product scope requires products; subscription scope requires none' });
export const lineInput = z.object({ productId: id, variantId: id.nullable().default(null), quantity: z.number().int().min(1).max(1000000), unitPrice: money.optional() }).strict();
export const templateInput = z.object({ name: title, planId: id, validityDays: z.number().int().min(1).max(3650), isActive: z.boolean().default(true), lines: z.array(lineInput).min(1).max(100) }).strict();
export const subscriptionInput = z.object({ customerId: id, planId: id, startDate: date, expiryDate: date.nullable().default(null), paymentTermsDays: z.number().int().min(0).max(365), notes: note.nullable().optional(), lines: z.array(lineInput).min(1).max(100) }).strict().refine(v => !v.expiryDate || v.expiryDate >= v.startDate, { path: ['expiryDate'], message: 'Must be on or after startDate' });
export const fromTemplateInput = z.object({ templateId: id, customerId: id, startDate: date, paymentTermsDays: z.number().int().min(0).max(365), notes: note.nullable().optional() }).strict();
export const transitionInput = z.object({ to: subscriptionStatus, reason: z.string().max(500).optional(), renewalExpiryDate: date.optional() }).strict();
export const billingInput = z.object({ asOfDate: date, maxPeriodsPerSubscription: z.number().int().min(1).max(120).default(24) }).strict();
export const paymentInput = z.object({ invoiceId: id, method: paymentMethod, amount: positiveMoney, date, note: note.nullable().optional() }).strict();
```

## Exact response and client input shapes

Canonical mirror: `client/src/types/api.ts`. User.passwordHash and PasswordResetToken never appear on the wire. DB Decimal values must serialize explicitly to two places; raw Prisma JSON is not this contract. TemplateLine.unitPrice is null when the template inherits the current catalog price. Required<T> fields with `| null` remain nullable on responses.

```ts
// Frozen transport contracts. All money is INR decimal strings; dates are YYYY-MM-DD.
export type Id = string;
export type Money = string;
export type DateOnly = string;
export type Timestamp = string;
export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';
export type ProductType = 'SERVICE' | 'DIGITAL' | 'PHYSICAL';
export type BillingPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type SubscriptionStatus = 'DRAFT' | 'QUOTATION' | 'CONFIRMED' | 'ACTIVE' | 'PAUSED' | 'CLOSED';
export type InvoiceStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD';
export type DiscountType = 'FIXED' | 'PERCENTAGE';
export type DiscountScope = 'PRODUCT' | 'SUBSCRIPTION';
export interface ApiErrorBody { error: { code: string; message: string; fields?: Record<string, string[]> } }
export interface Data<T> { data: T }
export interface Page<T> { data: T[]; page: number; pageSize: number; total: number }
export interface Message { message: string }
export interface ListQuery { page?: number; pageSize?: number; search?: string; sortBy?: 'createdAt' | 'name' | 'number' | 'dueDate' | 'nextInvoiceDate' | 'date'; sortOrder?: 'asc' | 'desc' }
export interface SubscriptionQuery extends ListQuery { status?: SubscriptionStatus; customerId?: Id; planId?: Id }
export interface InvoiceQuery extends ListQuery { status?: InvoiceStatus; customerId?: Id; planId?: Id; from?: DateOnly; to?: DateOnly; overdue?: 'true' | 'false' }
export interface PaymentQuery extends ListQuery { invoiceId?: Id; customerId?: Id; method?: PaymentMethod; from?: DateOnly; to?: DateOnly }
export interface ReportQuery { from?: DateOnly; to?: DateOnly; customerId?: Id; planId?: Id; status?: SubscriptionStatus }
export type PortalSubscriptionQuery = ListQuery & { status?: SubscriptionStatus };
export type PortalInvoiceQuery = ListQuery & { status?: InvoiceStatus; overdue?: 'true' | 'false' };
export interface User { id: Id; name: string; email: string; role: Role; isActive: boolean; createdAt: Timestamp }
export interface SignupInput { name: string; email: string; password: string }
export interface LoginInput { email: string; password: string }
export interface ForgotPasswordInput { email: string }
export interface ResetPasswordInput { token: string; password: string }
export type StaffInput = SignupInput;
export interface AuthSession { user: User; token: string; expiresAt: Timestamp }
export interface VariantInput { attribute: string; value: string; extraPrice: Money; isActive?: boolean }
export interface ProductVariant extends Required<VariantInput> { id: Id; productId: Id }
export interface ProductInput { name: string; type: ProductType; salesPrice: Money; costPrice: Money; notes?: string | null; isActive?: boolean; taxIds?: Id[] }
export interface Product extends Omit<ProductInput, 'isActive' | 'taxIds' | 'notes'> { id: Id; isActive: boolean; notes: string | null; taxIds: Id[]; variants: ProductVariant[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface PlanInput { name: string; price: Money; billingPeriod: BillingPeriod; minQuantity: number; availableFrom?: DateOnly | null; availableTo?: DateOnly | null; autoClose: boolean; closableEarly: boolean; pausable: boolean; renewable: boolean; isActive?: boolean; taxIds?: Id[] }
export interface Plan extends Required<PlanInput> { id: Id; createdAt: Timestamp; updatedAt: Timestamp }
export interface TaxInput { name: string; percentage: string; isActive?: boolean; productIds?: Id[]; planIds?: Id[] }
export interface Tax extends Required<TaxInput> { id: Id; createdAt: Timestamp; updatedAt: Timestamp }
export interface DiscountInput { name: string; type: DiscountType; scope: DiscountScope; value: Money; minPurchase?: Money | null; minQuantity?: number | null; startsAt: DateOnly; endsAt?: DateOnly | null; usageLimit?: number | null; isActive?: boolean; productIds?: Id[] }
export interface Discount extends Required<DiscountInput> { id: Id; usedCount: number; createdAt: Timestamp; updatedAt: Timestamp }
export interface DiscountUsage { id: Id; discountId: Id; invoiceId: Id; amount: Money; createdAt: Timestamp }
export interface LineInput { productId: Id; variantId?: Id | null; quantity: number; unitPrice?: Money }
export interface TemplateInput { name: string; planId: Id; validityDays: number; isActive?: boolean; lines: LineInput[] }
export interface TemplateLine extends Omit<LineInput, 'variantId' | 'unitPrice'> { id: Id; templateId: Id; variantId: Id | null; unitPrice: Money | null; position: number }
export interface QuotationTemplate extends Omit<Required<TemplateInput>, 'lines'> { id: Id; lines: TemplateLine[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface SubscriptionInput { customerId: Id; planId: Id; startDate: DateOnly; expiryDate?: DateOnly | null; paymentTermsDays: number; notes?: string | null; lines: LineInput[] }
export interface FromTemplateInput { templateId: Id; customerId: Id; startDate: DateOnly; paymentTermsDays: number; notes?: string | null }
export interface SubscriptionLine { id: Id; subscriptionId: Id; productId: Id; variantId: Id | null; description: string; quantity: number; unitPrice: Money; position: number }
export interface SubscriptionEvent { id: Id; subscriptionId: Id; fromStatus: SubscriptionStatus; toStatus: SubscriptionStatus; actorId: Id | null; reason: string | null; createdAt: Timestamp }
export interface Subscription extends Omit<SubscriptionInput, 'expiryDate' | 'notes' | 'lines'> { id: Id; number: string; templateId: Id | null; status: SubscriptionStatus; expiryDate: DateOnly | null; nextInvoiceDate: DateOnly; billingAnchorDay: number; billingAnchorMonth: number; notes: string | null; lines: SubscriptionLine[]; history: SubscriptionEvent[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface TransitionInput { to: SubscriptionStatus; reason?: string; renewalExpiryDate?: DateOnly }
export interface TaxSnapshot { taxId: Id; name: string; percentage: string; amount: Money }
export interface InvoiceLine { id: Id; invoiceId: Id; kind: 'CHARGE' | 'DISCOUNT'; productId: Id | null; variantId: Id | null; discountId: Id | null; description: string; quantity: number; unitPrice: Money; subtotal: Money; taxTotal: Money; total: Money; taxes: TaxSnapshot[]; position: number }
export interface Invoice { id: Id; number: string; subscriptionId: Id; customerId: Id; status: InvoiceStatus; periodStart: DateOnly; periodEnd: DateOnly; issueDate: DateOnly; dueDate: DateOnly; customerName: string; customerEmail: string; subtotal: Money; discountTotal: Money; taxTotal: Money; total: Money; amountPaid: Money; currency: 'INR'; sentAt: Timestamp | null; lines: InvoiceLine[]; payments: Payment[]; discountUsages: DiscountUsage[]; createdAt: Timestamp; updatedAt: Timestamp }
export interface PaymentInput { invoiceId: Id; method: PaymentMethod; amount: Money; date: DateOnly; note?: string | null }
export interface Payment extends Required<PaymentInput> { id: Id; recordedById: Id; createdAt: Timestamp }
export interface BillingInput { asOfDate: DateOnly; maxPeriodsPerSubscription?: number }
export interface BillingResult { created: number; skipped: number; failed: number; autoClosed: number; hasMore: boolean; failures: { subscriptionId: Id; code: string; message: string }[] }
export interface ReportSummary { activeSubscriptions: number; revenueCollected: Money; outstanding: Money; overdueCount: number; overdueAmount: Money; revenueByMonth: { month: string; amount: Money }[] }
export interface PortalSummary { activeSubscriptions: number; outstanding: Money; nextInvoiceDate: DateOnly | null }
```
