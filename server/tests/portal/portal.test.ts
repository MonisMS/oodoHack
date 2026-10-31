import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Customer portal (D-06): isolation is the point. Needs a disposable local PostgreSQL:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/brightloop_test npm test -w server
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const PW = 'Str0ng!Passw';
const uid = () => `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!TEST_DB)('customer portal (D-06)', () => {
  let app: Express; let db: typeof import('../../src/lib/db.js').db;
  let staff: ReturnType<typeof request.agent>; let alice: ReturnType<typeof request.agent>; let bob: ReturnType<typeof request.agent>;
  let aliceId: string; let bobId: string; let staffId: string; let product: { id: string }; let flex: { id: string }; let strict: { id: string };

  const makePlan = (data: Record<string, unknown>) => db.plan.create({ data: { name: `PP ${uid()}`, price: '100.00', billingPeriod: 'MONTHLY', minQuantity: 1, autoClose: true, closableEarly: false, pausable: false, renewable: false, ...data } });
  const newSub = async (customerId: string, planId: string, status: 'DRAFT' | 'ACTIVE' = 'ACTIVE', over: Record<string, unknown> = {}) => {
    const r = await staff.post('/api/subscriptions').send({ customerId, planId, startDate: iso(-10), paymentTermsDays: 15, notes: 'INTERNAL: negotiate harder', lines: [{ productId: product.id, quantity: 2 }], ...over });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    if (status === 'ACTIVE') { for (const to of ['QUOTATION', 'CONFIRMED', 'ACTIVE']) await staff.post(`/api/subscriptions/${r.body.data.id}/transition`).send({ to, reason: `internal ${to}` }); await db.subscription.update({ where: { id: r.body.data.id }, data: { nextInvoiceDate: new Date(iso(20)) } }); }
    return r.body.data.id as string;
  };
  let invSeq = 0;
  const invoice = async (subscriptionId: string, customerId: string, over: { status?: string; total?: string; paid?: string; due?: number; issue?: number } = {}) => {
    invSeq += 1; const total = over.total ?? '500.00';
    return db.invoice.create({ data: { number: `INV/P/${uid()}`, subscriptionId, customerId, status: (over.status ?? 'CONFIRMED') as never, periodStart: new Date(`${2001 + (invSeq % 80)}-01-${String((invSeq % 27) + 1).padStart(2, '0')}`), periodEnd: new Date('2099-01-01'), issueDate: new Date(iso(over.issue ?? -20)), dueDate: new Date(iso(over.due ?? 10)), customerName: 'N', customerEmail: 'n@example.com', subtotal: total, taxTotal: '0.00', total, amountPaid: over.paid ?? '0.00' } });
  };
  const login = async (email: string) => { const a = request.agent(app); expect((await a.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password: PW })).status).toBe(200); return a; };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js')); ({ db } = await import('../../src/lib/db.js'));
    const { createCredentialUser } = await import('../../src/lib/auth.js');
    const mk = async (role: 'STAFF' | 'CUSTOMER', n: string) => { const email = `portal.${n}.${uid()}@example.com`; const u = await createCredentialUser({ name: n, email, password: PW, role }); return { id: u.id, agent: await login(email) }; };
    const s = await mk('STAFF', 'staff'); staff = s.agent; staffId = s.id;
    const a = await mk('CUSTOMER', 'alice'); alice = a.agent; aliceId = a.id;
    const b = await mk('CUSTOMER', 'bob'); bob = b.agent; bobId = b.id;
    product = await db.product.create({ data: { name: `PortalProd ${uid()}`, salesPrice: '50.00', costPrice: '5.00' } });
    flex = await makePlan({ closableEarly: true, pausable: true, renewable: true }); strict = await makePlan({});
  });
  afterAll(async () => { await db?.$disconnect(); });

  describe('subscriptions', () => {
    it('lists and opens only the caller\'s own subscriptions; foreign and unknown ids are the same 404', async () => {
      const mine = await newSub(aliceId, flex.id); const his = await newSub(bobId, flex.id);
      const list = await alice.get('/api/portal/subscriptions?pageSize=100');
      expect(list.status).toBe(200);
      const ids = list.body.data.map((s: { id: string }) => s.id);
      expect(ids).toContain(mine); expect(ids).not.toContain(his);
      expect(list.body.data.every((s: { customerId: string }) => s.customerId === aliceId)).toBe(true);
      expect((await alice.get(`/api/portal/subscriptions/${mine}`)).body.data.id).toBe(mine);
      const foreign = await alice.get(`/api/portal/subscriptions/${his}`); const unknown = await alice.get(`/api/portal/subscriptions/${crypto.randomUUID()}`);
      expect([foreign.status, unknown.status]).toEqual([404, 404]); expect(foreign.body).toEqual(unknown.body); // indistinguishable
    });

    it('hides drafts and internal details (staff notes, who changed what and why)', async () => {
      const draft = await newSub(aliceId, flex.id, 'DRAFT'); const live = await newSub(aliceId, flex.id);
      expect((await alice.get(`/api/portal/subscriptions/${draft}`)).status).toBe(404);
      expect((await alice.get('/api/portal/subscriptions?status=DRAFT')).body.data).toEqual([]);
      expect((await alice.get('/api/portal/subscriptions?pageSize=100')).body.data.map((s: { id: string }) => s.id)).not.toContain(draft);
      const view = (await alice.get(`/api/portal/subscriptions/${live}`)).body.data;
      expect(view.notes).toBeNull(); expect(view.history.length).toBeGreaterThan(0);
      expect(view.history.every((e: { actorId: unknown; reason: unknown }) => e.actorId === null && e.reason === null)).toBe(true);
      expect(view).toMatchObject({ allowedTransitions: [], billingDue: false, status: 'ACTIVE' });
      expect(JSON.stringify(view)).not.toMatch(/INTERNAL|negotiate|internal CONFIRMED/);
      const staffView = (await staff.get(`/api/subscriptions/${live}`)).body.data; expect(staffView.notes).toMatch(/INTERNAL/); // staff still see everything
    });

    it('cannot be steered to someone else\'s data through query parameters', async () => {
      expect((await alice.get(`/api/portal/subscriptions?customerId=${bobId}`)).status).toBe(422);
      expect((await alice.get(`/api/portal/invoices?customerId=${bobId}`)).status).toBe(422);
      expect((await alice.get('/api/portal/subscriptions?pageSize=1000')).status).toBe(422);
    });
  });

  describe('invoices', () => {
    it('shows only the caller\'s issued invoices (CONFIRMED / PARTIALLY_PAID / PAID); drafts and cancelled stay hidden', async () => {
      const s = await newSub(aliceId, flex.id); const sb = await newSub(bobId, flex.id);
      const shown = await Promise.all([invoice(s, aliceId, { status: 'CONFIRMED' }), invoice(s, aliceId, { status: 'PARTIALLY_PAID', paid: '100.00' }), invoice(s, aliceId, { status: 'PAID', paid: '500.00' })]);
      const hidden = await Promise.all([invoice(s, aliceId, { status: 'DRAFT' }), invoice(s, aliceId, { status: 'CANCELLED' })]);
      const bobs = await invoice(sb, bobId, { status: 'CONFIRMED' });
      const ids = (await alice.get('/api/portal/invoices?pageSize=100')).body.data.map((i: { id: string }) => i.id);
      for (const i of shown) expect(ids).toContain(i.id);
      for (const i of [...hidden, bobs]) expect(ids).not.toContain(i.id);
      for (const i of [...hidden, bobs]) expect([i.id, (await alice.get(`/api/portal/invoices/${i.id}`)).status]).toEqual([i.id, 404]);
      expect((await alice.get('/api/portal/invoices?status=DRAFT')).body.data).toEqual([]);
      expect((await bob.get(`/api/portal/invoices/${bobs.id}`)).status).toBe(200);
    });

    it('hides payment recorder/notes and dunning history, and keeps derived overdue/outstanding', async () => {
      const s = await newSub(aliceId, flex.id); const inv = await invoice(s, aliceId, { status: 'PARTIALLY_PAID', total: '500.00', paid: '200.00', due: -4, issue: -20 });
      await db.payment.create({ data: { invoiceId: inv.id, recordedById: staffId, method: 'UPI', amount: '200.00', date: new Date(iso(-10)), note: 'INTERNAL: customer promised the rest' } });
      await db.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: new Date(), reminderCount: 3 } });
      const view = (await alice.get(`/api/portal/invoices/${inv.id}`)).body.data;
      expect(view).toMatchObject({ status: 'PARTIALLY_PAID', outstanding: '300.00', overdue: true, lastReminderAt: null, reminderCount: 0 });
      expect(view.payments).toHaveLength(1); expect(view.payments[0]).toMatchObject({ amount: '200.00', method: 'UPI' });
      expect(view.payments[0]).not.toHaveProperty('recordedById'); expect(view.payments[0]).not.toHaveProperty('note');
      expect(JSON.stringify(view)).not.toMatch(/INTERNAL|promised/);
    });

    it('filters by status and overdue (combined correctly) and paginates', async () => {
      const s = await newSub(aliceId, flex.id); const tag = uid();
      const late = await invoice(s, aliceId, { status: 'CONFIRMED', due: -2 }); const fresh = await invoice(s, aliceId, { status: 'CONFIRMED', due: 15 }); const paid = await invoice(s, aliceId, { status: 'PAID', paid: '500.00', due: -30, issue: -40 });
      const q = (extra: string) => alice.get(`/api/portal/invoices?pageSize=100${extra}`).then(r => r.body.data.map((i: { id: string }) => i.id));
      expect(await q('&overdue=true')).toEqual(expect.arrayContaining([late.id])); expect(await q('&overdue=true')).not.toContain(fresh.id); expect(await q('&overdue=true')).not.toContain(paid.id);
      expect(await q('&overdue=false')).toEqual(expect.arrayContaining([fresh.id, paid.id])); expect(await q('&overdue=false')).not.toContain(late.id);
      expect(await q('&status=PAID&overdue=false')).toContain(paid.id); expect(await q('&status=PAID&overdue=true')).toEqual([]); // both filters apply
      const page = await alice.get('/api/portal/invoices?pageSize=2&page=1&sortBy=dueDate&sortOrder=asc');
      expect(page.body).toMatchObject({ page: 1, pageSize: 2 }); expect(page.body.data.length).toBeLessThanOrEqual(2); expect(tag).toBeTruthy();
    });
  });

  describe('summary', () => {
    it('adds up only the caller\'s numbers', async () => {
      const carol = `portal.carol.${uid()}@example.com`; const { createCredentialUser } = await import('../../src/lib/auth.js');
      const cId = (await createCredentialUser({ name: 'Carol', email: carol, password: PW, role: 'CUSTOMER' })).id; const carolAgent = await login(carol);
      expect((await carolAgent.get('/api/portal/summary')).body.data).toEqual({ activeSubscriptions: 0, outstanding: '0.00', overdueInvoices: 0, nextInvoiceDate: null });
      const s1 = await newSub(cId, flex.id); const s2 = await newSub(cId, flex.id); await db.subscription.update({ where: { id: s2 }, data: { nextInvoiceDate: new Date(iso(5)) } });
      await invoice(s1, cId, { status: 'CONFIRMED', total: '400.00' }); await invoice(s1, cId, { status: 'PARTIALLY_PAID', total: '300.00', paid: '100.00', due: -3, issue: -20 });
      await invoice(s1, cId, { status: 'PAID', total: '999.00', paid: '999.00' }); await invoice(s1, cId, { status: 'DRAFT', total: '777.00' }); await invoice(s1, cId, { status: 'CANCELLED', total: '555.00' });
      await invoice(await newSub(bobId, flex.id), bobId, { status: 'CONFIRMED', total: '10000.00', due: -9, issue: -20 }); // someone else's debt must not leak in
      expect((await carolAgent.get('/api/portal/summary')).body.data).toEqual({ activeSubscriptions: 2, outstanding: '600.00', overdueInvoices: 1, nextInvoiceDate: iso(5) });
    });
  });

  describe('cancel at period end (customer self-service)', () => {
    const cancel = (agent: typeof alice, id: string, body: object = {}) => agent.post(`/api/portal/subscriptions/${id}/cancel-at-period-end`).set('Origin', ORIGIN).send(body);
    const keep = (agent: typeof alice, id: string) => agent.post(`/api/portal/subscriptions/${id}/keep`).set('Origin', ORIGIN).send({});

    it('lets a customer schedule and withdraw the end of their own subscription, hiding internal reasons', async () => {
      const id = await newSub(aliceId, flex.id);
      expect((await alice.get(`/api/portal/subscriptions/${id}`)).body.data).toMatchObject({ canScheduleCancellation: true, canWithdrawCancellation: false });
      const r = await cancel(alice, id, { reason: 'switching vendor' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ cancelAtPeriodEnd: true, canScheduleCancellation: false, canWithdrawCancellation: true, status: 'ACTIVE' });
      expect(r.body.data.expiryDate).toBe(iso(19)); expect(JSON.stringify(r.body.data)).not.toMatch(/switching vendor|Requested by customer/);
      const staffHistory = (await staff.get(`/api/subscriptions/${id}`)).body.data.history.at(-1);
      expect(staffHistory).toMatchObject({ actorId: aliceId }); expect(staffHistory.reason).toMatch(/Requested by customer.*switching vendor/);
      expect((await cancel(alice, id)).status).toBe(409); // already scheduled
      const kept = await keep(alice, id); expect(kept.status).toBe(200); expect(kept.body.data).toMatchObject({ cancelAtPeriodEnd: false, expiryDate: null, canScheduleCancellation: true });
    });

    it('never lets one customer act on another customer\'s subscription (404, nothing changes)', async () => {
      const his = await newSub(bobId, flex.id);
      expect((await cancel(alice, his)).status).toBe(404); expect((await keep(alice, his)).status).toBe(404);
      expect((await cancel(alice, crypto.randomUUID())).status).toBe(404);
      const row = await db.subscription.findUniqueOrThrow({ where: { id: his } }); expect(row.cancelScheduledAt).toBeNull(); expect(row.expiryDate).toBeNull();
      const draft = await newSub(aliceId, flex.id, 'DRAFT'); expect((await cancel(alice, draft)).status).toBe(404); // hidden drafts cannot be touched either
    });

    it('respects the plan, and invoices anything already due before ending the subscription', async () => {
      const locked = await newSub(aliceId, strict.id);
      const refused = await cancel(alice, locked); expect(refused.status).toBe(409); expect(refused.body.error.message).toMatch(/does not allow ending before/);
      expect((await keep(alice, locked)).status).toBe(409); // nothing scheduled, nothing to withdraw
      // A period that is already due is invoiced first (the billing engine settles it), then the cancellation is scheduled.
      const due = await newSub(aliceId, flex.id); await db.subscription.update({ where: { id: due }, data: { nextInvoiceDate: new Date(iso(-1)) } });
      const settled = await cancel(alice, due); expect(settled.status, JSON.stringify(settled.body)).toBe(200); expect(settled.body.data.cancelAtPeriodEnd).toBe(true);
      expect(await db.invoice.count({ where: { subscriptionId: due } })).toBeGreaterThanOrEqual(1);
    });
  });

  describe('access control', () => {
    it('is for customers only: staff, admins and anonymous callers are refused', async () => {
      const paths: Array<['get' | 'post', string]> = [['get', '/api/portal/summary'], ['get', '/api/portal/subscriptions'], ['get', '/api/portal/invoices'], ['get', `/api/portal/invoices/${crypto.randomUUID()}`], ['post', `/api/portal/subscriptions/${crypto.randomUUID()}/cancel-at-period-end`]];
      for (const [method, path] of paths) {
        expect([path, (await staff[method](path).set('Origin', ORIGIN).send({})).status]).toEqual([path, 403]);
        expect([path, (await request(app)[method](path).send({})).status]).toEqual([path, 401]);
      }
    });
  });
});
