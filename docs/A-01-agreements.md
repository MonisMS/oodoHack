# A-01 — shared agreements (owner: A)

Status legend: **PUBLISHED** = in code on `feat/A-core` / this branch, safe to build against. **PROPOSED** = A's reading of the contract + TASKS.md; Monis (B) confirms or edits before A-03/A-04 depend on it.

## 1. Client session interface — PUBLISHED (for C)

`client/src/lib/session.tsx`. Auth forms call `useSession()` only; never import `better-auth` directly.

```ts
const { user, role, status, signIn, signUp, signOut, requestReset, resetPassword } = useSession();
// status: 'loading' | 'authenticated' | 'anonymous'
// every action → Promise<{ ok: true } | { ok: false; code: string; message: string }>  (never throws)
signIn({ email, password })            signUp({ name, email, password })     // signUp always creates a CUSTOMER
signOut()                              requestReset({ email })               // neutral message, same for unknown emails
resetPassword({ token, password })     // token comes from ?token= on /reset-password
```

Error `code`s to branch on: `INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS`, `WEAK_PASSWORD`, `ACCOUNT_DISABLED`, `INVALID_TOKEN`, `NETWORK_ERROR`. Show `message` as-is otherwise.
Redirect after login: `ADMIN`/`STAFF` → `/dashboard`, `CUSTOMER` → `/portal`. Password rules: client mirrors `password` in `server/src/lib/contracts.ts`.

Server endpoints behind it are Better Auth's `/api/auth/*` (see API_CONTRACT.md). Staff and customer lists: `GET /api/users/staff`, `POST /api/users/staff`, `GET /api/users/customers`.

## 2. Fixture IDs and demo logins — PUBLISHED (for D, and every test author)

`server/src/lib/fixtures.ts` exports `FIXTURE_IDS`, `FIXTURE_USERS`, `DEMO_PASSWORD`. Values never change; new ones are added only through A.

| Fixture | Id / login |
|---|---|
| admin | `…0101` · admin@brightloop.local |
| staff Priya / Rahul | `…0201` priya@brightloop.local · `…0202` rahul@brightloop.local |
| customers Acme / Northwind / Globex | `…0301` billing@acme.example · `…0302` accounts@northwind.example · `…0303` finance@globex.example |
| catalog | taxGst18 `…0401`, taxGst5 `…0402`, productCrm `…0411`, variantCrmOdoo `…0412` (Brand=Odoo, +560.00), variantCrmOther `…0413`, planMonthly `…0421`, planYearly `…0422`, discountSeats `…0431` (10 % at quantity ≥ 5) |

(Full UUID form is `00000000-0000-4000-8000-` + the 12-digit suffix, e.g. admin = `00000000-0000-4000-8000-000000000101`.)

Rules for the seed (D-07):
- Create the six users with `createCredentialUser({ id, name, email, password: DEMO_PASSWORD, role })` from `server/src/lib/auth.ts` (writes user + credential account atomically, hashed like real signups). Do not insert users with raw Prisma.
- Create the catalog rows with the ids above so cross-module tests share the same data.
- Seed must be idempotent (skip rows that exist) and must refuse to run when `NODE_ENV=production`. Never truncate.

## 3. Pure domain signatures — PROPOSED (for B to confirm)

Location `server/src/lib/domain/*`, no Prisma, integer paise (safe integers), dates as `YYYY-MM-DD` strings (`DateOnly`). Where the contract already freezes a signature it is marked **frozen**.

```ts
// money.ts
toMinor(amount: string): number                       // "1234.50" -> 123450; throws on malformed input
fromMinor(minor: number): string                      // 123450 -> "1234.50"
lineAmountMinor(quantity: number, unitPriceMinor: number): number
effectiveUnitPriceMinor(productPriceMinor: number, variantExtraMinor?: number | null): number   // variant added exactly once
computeLineTax(baseMinor: number, percentage: string): number                                   // frozen; round-half-up

// period.ts   (anchor = subscription start / first invoice date; periods are [start, end))
nextInvoiceDate(anchor: DateOnly, period: BillingPeriod, periodsElapsed: number): DateOnly       // always from the ORIGINAL anchor
listDuePeriods(input: { anchor: DateOnly; nextInvoiceDate: DateOnly; asOfDate: DateOnly; expiryDate: DateOnly | null;
                        period: BillingPeriod; max: number }): { periods: Array<{ start: DateOnly; end: DateOnly }>; hasMore: boolean }
                                                                                                 // expiry inclusive; last end clipped to expiry+1

// discount.ts
findApplicableDiscounts(discounts: Discount[], context: { periodStart: DateOnly; productId: Id | null; quantity: number; subtotalMinor: number }): Discount[]   // frozen

// states.ts
type TransitionCheck = { ok: true } | { ok: false; reason: string }                              // reason becomes the 409 message
interface SubscriptionContext { plan: { pausable: boolean; closableEarly: boolean; renewable: boolean };
                                expiryDate: DateOnly | null; today: DateOnly; renewalExpiryDate?: DateOnly | null }
canTransition(from: SubscriptionStatus, to: SubscriptionStatus, ctx: SubscriptionContext): TransitionCheck
allowedTransitions(from: SubscriptionStatus, ctx: SubscriptionContext): SubscriptionStatus[]
canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus, ctx: { paymentCount: number }): TransitionCheck

// invoice-draft.ts
buildInvoiceDraft(input: { periodStart: DateOnly; periodEnd: DateOnly; lines: Array<{ productId: Id | null; description: string; quantity: number; unitPriceMinor: number; taxes: Array<{ taxId: Id; name: string; percentage: string }> }>;
                           planFee: { name: string; priceMinor: number; taxes: [...] } | null; discounts: Discount[] }): InvoiceDraft
// InvoiceDraft = { lines: [...charge lines with tax snapshots + negative discount lines], subtotalMinor, discountTotalMinor, taxTotalMinor, totalMinor, appliedDiscountIds: Id[] }
```

Who calls what:
- **A (A-03)** uses `effectiveUnitPriceMinor`, `lineAmountMinor`, `canTransition`, `allowedTransitions` when creating subscriptions and transitioning them; persists status + `SubscriptionEvent`.
- **A (A-04)** uses `canTransitionInvoice`; keeps payment/lock logic in `payments` service.
- **B** owns `listDuePeriods`, `buildInvoiceDraft` and the billing transaction; A only imports them for previews if needed.

### Questions for Monis (answer in `docs/status/B.md` or by editing section 3)
1. Are the names/shapes above acceptable? Any deviation → edit this file in the same PR as the code.
2. `canTransition` returns `{ok,reason}` (not a boolean) so A can return a precise 409; OK?
3. Renewal: `ctx.renewalExpiryDate` is required and must be later than the old expiry and `today` (contract table) — enforced in `canTransition`?
4. Can `docs/status/B.md` list the pure helpers already pushed, so A-03 can import real code instead of stubs? Target: money + states first (A-03 needs them), period + draft later.

## 4. Contract corrections made in this task

- The "Auth A" service list (`signup/login/getMe/requestReset/resetPassword`) is **removed**: those are Better Auth endpoints now.
- User-module exports take the acting principal, matching the contract convention (`listCustomers(q, actor)`, `listStaff(q, actor)`, `createStaff(input, actor)`).
