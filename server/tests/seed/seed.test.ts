import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { assertDisposableDatabase, assertSeedAllowed, rng, stableUuid } from '../../src/seed/support.js';
import { id as uuidSchema } from '../../src/lib/contracts.js';
import { DEMO_PASSWORD, FIXTURE_IDS } from '../../src/lib/fixtures.js';

// The seed writes hundreds of rows and runs the billing engine, so it gets its OWN disposable database:
//   SEED_TEST_DATABASE_URL=postgresql://user:pass@127.0.0.1:5433/brightloop_seed_test npm test -w server
const SEED_DB = process.env.SEED_TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';

describe('seed safety (no database needed)', () => {
  it('derives stable, valid and distinct ids', () => {
    expect(stableUuid('x', 1)).toBe(stableUuid('x', 1));
    expect(stableUuid('x', 1)).not.toBe(stableUuid('x', 2)); expect(stableUuid('x', 1)).not.toBe(stableUuid('y', 1));
    for (let i = 0; i < 200; i++) expect(uuidSchema.safeParse(stableUuid('sub', i)).success).toBe(true);
    expect(new Set(Array.from({ length: 5000 }, (_, i) => stableUuid('sub', i))).size).toBe(5000);
  });
  it('has a deterministic random generator', () => {
    const a = rng(42); const b = rng(42);
    expect(Array.from({ length: 5 }, () => a.int(1, 100))).toEqual(Array.from({ length: 5 }, () => b.int(1, 100)));
  });
  it('never seeds production, and the volume set only runs on a disposable local database', () => {
    expect(() => assertSeedAllowed('production')).toThrow(/production/);
    expect(() => assertSeedAllowed('development')).not.toThrow();
    for (const ok of ['postgresql://u:p@localhost:5432/brightloop_test', 'postgresql://u@127.0.0.1:5433/brightloop_perf?schema=public', 'postgresql://u@[::1]/demo_db']) expect(() => assertDisposableDatabase(ok)).not.toThrow();
    for (const bad of ['postgresql://u:p@db.example.com:5432/brightloop_test', 'postgresql://u:p@localhost:5432/brightloop', 'postgresql://u:p@localhost:5432/production', 'not a url', undefined]) expect(() => assertDisposableDatabase(bad as string), String(bad)).toThrow();
  });
});

describe.skipIf(!SEED_DB)('seed (D-07) against a disposable database', () => {
  let db: typeof import('../../src/lib/db.js').db; let runSeed: typeof import('../../src/seed/run.js').runSeed; let app: import('express').Express;
  let first: Awaited<ReturnType<typeof import('../../src/seed/run.js').runSeed>>;
  let decoy: { id: string; nextInvoiceDate: Date };
  const PERF = { perf: true, subscriptions: 60, customers: 20 } as const;
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  beforeAll(async () => {
    process.env.DATABASE_URL = SEED_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ db } = await import('../../src/lib/db.js')); ({ runSeed } = await import('../../src/seed/run.js')); ({ app } = await import('../../src/app.js'));
    // A pre-existing, due-for-billing subscription that is NOT part of the seed must never be invoiced by seeding.
    const customer = await db.user.create({ data: { name: 'Decoy', email: `decoy.${Date.now()}@example.com`, role: 'CUSTOMER' } });
    const plan = await db.plan.create({ data: { name: `Decoy plan ${Date.now()}`, price: '10.00', billingPeriod: 'MONTHLY', minQuantity: 1, autoClose: true, closableEarly: false, pausable: false, renewable: false } });
    decoy = await db.subscription.create({ data: { number: `SUB/DECOY/${Date.now()}`, customerId: customer.id, planId: plan.id, status: 'ACTIVE', startDate: new Date('2026-01-01'), nextInvoiceDate: new Date('2026-02-01'), billingAnchorDay: 1, billingAnchorMonth: 1 }, select: { id: true, nextInvoiceDate: true } });
    first = await runSeed(db, { ...PERF, databaseUrl: SEED_DB });
  }, 240_000);
  afterAll(async () => { await db?.$disconnect(); });

  it('creates the accounts, catalog and demo story the presentation needs', async () => {
    expect((await db.user.findMany({ where: { id: { in: Object.values(FIXTURE_IDS.users) } } })).map(u => u.role).sort()).toEqual(['ADMIN', 'CUSTOMER', 'CUSTOMER', 'CUSTOMER', 'STAFF', 'STAFF']);
    expect(await db.product.count()).toBeGreaterThanOrEqual(10); expect(await db.productVariant.count({ where: { id: FIXTURE_IDS.catalog.variantCrmOdoo, extraPrice: '560' } })).toBe(1);
    expect(await db.plan.count()).toBeGreaterThanOrEqual(6); expect(await db.tax.count()).toBeGreaterThanOrEqual(2); expect(await db.quotationTemplate.count()).toBeGreaterThanOrEqual(2);
    const discounts = await db.discount.findMany(); expect(discounts.length).toBeGreaterThanOrEqual(3);
    expect(discounts.some(d => d.endsAt && d.endsAt < new Date())).toBe(true); // an expired one, to show expiry
    const story = Object.fromEntries((await db.subscription.findMany({ where: { notes: { startsWith: 'seed:demo:' } } })).map(s => [s.notes!.replace('seed:demo:', ''), s]));
    expect(Object.keys(story)).toHaveLength(9);
    expect(story['acme-crm-monthly']!.status).toBe('ACTIVE'); expect(story['globex-paused']!.status).toBe('PAUSED'); expect(story['globex-expired']!.status).toBe('CLOSED');
    expect(story['acme-enterprise-quote']!.status).toBe('QUOTATION'); expect(story['northwind-trial-draft']!.status).toBe('DRAFT');
    expect(story['acme-weekly-cancelling']!.cancelScheduledAt).not.toBeNull(); expect(story['globex-from-template']!.templateId).toBe((await import('../../src/seed/support.js')).stableUuid('template', 'crm-starter'));
  });

  it('bills history through the real engine: realistic dates, a mix of outcomes and a seat discount', async () => {
    const demo = await db.invoice.findMany({ where: { subscription: { notes: { startsWith: 'seed:demo:' } } }, include: { lines: true, payments: true } });
    expect(demo.length).toBeGreaterThanOrEqual(15);
    const statuses = new Set(demo.map(i => i.status)); for (const s of ['PAID', 'PARTIALLY_PAID', 'CONFIRMED']) expect(statuses.has(s as never), s).toBe(true);
    expect(demo.some(i => ['CONFIRMED', 'PARTIALLY_PAID'].includes(i.status) && i.dueDate < new Date())).toBe(true); // something is overdue for the dashboard
    expect(new Set(demo.map(i => iso(i.issueDate))).size).toBeGreaterThan(3); // issued on different (past) dates, not all today
    const seats = await db.invoice.findFirst({ where: { subscription: { notes: 'seed:demo:northwind-yearly-seats' } }, include: { lines: true } });
    expect(seats!.lines.some(l => l.kind === 'DISCOUNT')).toBe(true); expect(seats!.discountTotal.toNumber()).toBeGreaterThan(0);
    expect(await db.invoice.count({ where: { status: 'DRAFT', subscription: { OR: [{ notes: { startsWith: 'seed:' } }, { number: { startsWith: 'SUB/SEED/' } }] } } })).toBe(0); // nothing left half-processed
  });

  it('keeps every seeded invoice and payment internally consistent', async () => {
    const bad = await db.$queryRaw<Array<{ number: string; why: string }>>`
      SELECT i.number, CASE
          WHEN i.total <> i.subtotal + i."taxTotal" - i."discountTotal" THEN 'total does not add up'
          WHEN i."amountPaid" <> COALESCE((SELECT SUM(p.amount) FROM "Payment" p WHERE p."invoiceId" = i.id), 0) THEN 'amountPaid <> sum(payments)'
          WHEN i.status = 'PAID' AND i."amountPaid" <> i.total THEN 'PAID but not fully paid'
          WHEN i.status = 'PARTIALLY_PAID' AND (i."amountPaid" <= 0 OR i."amountPaid" >= i.total) THEN 'PARTIALLY_PAID amount out of range'
          WHEN i.status = 'CONFIRMED' AND i."amountPaid" <> 0 THEN 'CONFIRMED with payments'
          WHEN i."issueDate" > CURRENT_DATE + 1 THEN 'issued in the future'
          WHEN EXISTS (SELECT 1 FROM "Payment" p WHERE p."invoiceId" = i.id AND (p.date < i."issueDate" OR p.date > CURRENT_DATE + 1)) THEN 'payment date outside [issue, today]'
        END AS why
      FROM "Invoice" i JOIN "Subscription" s ON s.id = i."subscriptionId"
      WHERE (s.notes LIKE 'seed:%' OR s.number LIKE 'SUB/SEED/%') AND i.status <> 'CANCELLED'`;
    expect(bad.filter(r => r.why)).toEqual([]);
  });

  it('adds the volume set: customers, subscriptions with lines, and paused/closed/paid outcomes', async () => {
    expect(await db.user.count({ where: { email: { endsWith: '@seed.example' } } })).toBe(17); // 20 customers in total, 3 of them are the fixture accounts
    expect(first).toBeDefined(); // (the database may already hold the seed from an earlier run; idempotency is asserted separately)
    const perf = await db.subscription.findMany({ where: { number: { startsWith: 'SUB/SEED/PERF/' } }, include: { lines: true, invoices: true } });
    expect(perf).toHaveLength(60);
    expect(perf.every(s => s.lines.length >= 1 && s.planPrice !== null)).toBe(true);
    expect(perf.filter(s => s.status === 'QUOTATION').every(s => s.invoices.length === 0)).toBe(true);
    expect(perf.filter(s => ['ACTIVE', 'PAUSED', 'CLOSED'].includes(s.status)).every(s => s.invoices.length >= 1)).toBe(true);
    for (const s of perf.filter(s => s.status === 'CLOSED')) expect(s.expiryDate!.getTime()).toBeGreaterThanOrEqual(s.startDate.getTime());
    expect(new Set(perf.map(s => s.status)).size).toBeGreaterThanOrEqual(2);
    const planTotals = await db.plan.count({ where: { subscriptions: { some: { number: { startsWith: 'SUB/SEED/PERF/' } } } } }); expect(planTotals).toBeGreaterThanOrEqual(3);
  });

  it('never touches data that is not part of the seed', async () => {
    const row = await db.subscription.findUniqueOrThrow({ where: { id: decoy.id }, include: { invoices: true } });
    expect(row.invoices).toHaveLength(0); expect(row.nextInvoiceDate.getTime()).toBe(decoy.nextInvoiceDate.getTime());
  });

  it('lets the demo accounts sign in and shows a customer a believable portal', async () => {
    const login = async (email: string) => { const a = request.agent(app); expect((await a.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password: DEMO_PASSWORD })).status, email).toBe(200); return a; };
    const admin = await login('admin@brightloop.local'); await login('priya@brightloop.local'); await login('rahul@brightloop.local');
    expect((await admin.get('/api/subscriptions?pageSize=5')).body.total).toBeGreaterThanOrEqual(69);
    const acme = await login('billing@acme.example'); const summary = (await acme.get('/api/portal/summary')).body.data;
    expect(summary.activeSubscriptions).toBeGreaterThanOrEqual(1); expect(Number(summary.outstanding)).toBeGreaterThan(0); expect(summary.overdueInvoices).toBeGreaterThanOrEqual(1);
    const invoices = (await acme.get('/api/portal/invoices?pageSize=100')).body.data; expect(invoices.length).toBeGreaterThanOrEqual(5);
    expect(invoices.every((i: { customerId: string }) => i.customerId === FIXTURE_IDS.users.customerAcme)).toBe(true);
  });

  it('is idempotent: a second run creates and changes nothing', async () => {
    const count = async () => ({ users: await db.user.count(), subs: await db.subscription.count(), lines: await db.subscriptionLine.count(), invoices: await db.invoice.count(), invoiceLines: await db.invoiceLine.count(), payments: await db.payment.count(), products: await db.product.count(), plans: await db.plan.count(), discounts: await db.discount.count(), usage: (await db.discount.aggregate({ _sum: { usedCount: true } }))._sum.usedCount });
    const before = await count();
    const again = await runSeed(db, { ...PERF, databaseUrl: SEED_DB });
    expect(again).toEqual({ usersCreated: 0, demoSubscriptionsCreated: 0, perfCustomersCreated: 0, perfSubscriptionsCreated: 0, invoicesCreated: 0, autoClosed: 0, confirmed: 0, payments: 0 });
    expect(await count()).toEqual(before);
  }, 240_000);

  it('refuses the volume set on a database that is not clearly disposable', async () => {
    await expect(runSeed(db, { perf: true, databaseUrl: 'postgresql://u:p@localhost:5432/brightloop' })).rejects.toThrow(/disposable/);
    await expect(runSeed(db, { perf: true, databaseUrl: 'postgresql://u:p@prod-db.internal:5432/brightloop_test' })).rejects.toThrow(/disposable/);
  });
});
