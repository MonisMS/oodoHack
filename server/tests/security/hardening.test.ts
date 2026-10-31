import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { todayBusiness } from '../../src/lib/dates.js';

// A-10 safety hardening, verified end to end. Needs a disposable local PostgreSQL:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/brightloop_test npm test -w server
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const PW = 'Str0ng!Passw';
const uid = () => `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
const email = (t: string) => `${t}.${uid()}@example.com`;
const iso = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

describe('business calendar date', () => {
  it('is the Asia/Kolkata date, which runs ahead of UTC from 18:30 UTC', () => {
    expect(todayBusiness(new Date('2026-10-31T18:29:00Z'))).toBe('2026-10-31');
    expect(todayBusiness(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11-01'); // 00:00 IST
    expect(todayBusiness(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01'); // year boundary
  });
});

describe.skipIf(!TEST_DB)('safety hardening (A-10)', () => {
  let app: Express; let db: typeof import('../../src/lib/db.js').db; let create: typeof import('../../src/lib/auth.js').createCredentialUser;
  const A = {} as Record<'admin' | 'staff' | 'customer', ReturnType<typeof request.agent>>;
  const ids = {} as Record<'admin' | 'staff' | 'customer', string>; const emails = {} as Record<string, string>;
  let plan: { id: string }; let product: { id: string };

  const signIn = async (role: 'admin' | 'staff' | 'customer') => { const ag = request.agent(app); const r = await ag.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: emails[role], password: PW }); expect(r.status).toBe(200); A[role] = ag; };
  const sub = (over: Record<string, unknown> = {}) => ({ customerId: ids.customer, planId: plan.id, startDate: iso(0), expiryDate: null, paymentTermsDays: 0, lines: [{ productId: product.id, quantity: 1 }], ...over });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js')); ({ db } = await import('../../src/lib/db.js')); ({ createCredentialUser: create } = await import('../../src/lib/auth.js'));
    for (const role of ['admin', 'staff', 'customer'] as const) { emails[role] = email(`h.${role}`); ids[role] = (await create({ name: `H ${role}`, email: emails[role], password: PW, role: role.toUpperCase() as 'ADMIN' })).id; await signIn(role); }
    plan = await db.plan.create({ data: { name: `HP ${uid()}`, price: '10.00', billingPeriod: 'MONTHLY', minQuantity: 1, autoClose: true, closableEarly: true, pausable: true, renewable: true } });
    product = await db.product.create({ data: { name: `HProd ${uid()}`, salesPrice: '10.00', costPrice: '1.00' } });
  });
  afterAll(async () => { await db?.$disconnect(); });

  describe('input hygiene', () => {
    it('rejects NUL characters with 422 instead of crashing with 500', async () => {
      expect((await A.staff.post('/api/subscriptions').send(sub({ notes: 'x\u0000y' }))).status).toBe(422);
      expect((await A.staff.get(`/api/subscriptions?search=${encodeURIComponent('a\u0000b')}`)).status).toBe(422);
      expect((await A.staff.get(`/api/invoices?search=${encodeURIComponent('a\u0000b')}`)).status).toBe(422);
      expect((await A.staff.post('/api/quotation-templates').send({ name: 'n\u0000m', planId: plan.id, validityDays: 5, lines: [{ productId: product.id, quantity: 1 }] })).status).toBe(422);
      expect((await A.staff.post('/api/subscriptions/x/transition').send({ to: 'QUOTATION', reason: 'a\u0000' })).status).toBeGreaterThanOrEqual(400);
      expect((await A.admin.put(`/api/users/${ids.staff}`).send({ name: 'a\u0000b' })).status).toBe(422);
    });

    it('caps line and subscription totals so billing can always store them', async () => {
      const line = await A.staff.post('/api/subscriptions').send(sub({ lines: [{ productId: product.id, quantity: 1000000, unitPrice: '999999999999.99' }] }));
      expect(line.status).toBe(422); expect(line.body.error.fields['lines.0.quantity'][0]).toMatch(/exceeds the maximum/);
      expect((await A.staff.post('/api/subscriptions').send(sub({ lines: [{ productId: product.id, quantity: 1, unitPrice: '1000000000.00' }] }))).status).toBe(201); // exactly at the cap
      expect((await A.staff.post('/api/subscriptions').send(sub({ lines: [{ productId: product.id, quantity: 1, unitPrice: '1000000000.01' }] }))).status).toBe(422);
      const many = Array.from({ length: 11 }, () => ({ productId: product.id, quantity: 1, unitPrice: '1000000000.00' }));
      expect((await A.staff.post('/api/subscriptions').send(sub({ lines: many }))).body.error.fields.lines[0]).toMatch(/Subscription total/);
    });

    it('bounds start and expiry dates to sensible ranges', async () => {
      const post = (over: Record<string, unknown>) => A.staff.post('/api/subscriptions').send(sub(over));
      for (const startDate of ['0001-01-01', '1999-01-01', iso(-731), '9999-12-31', iso(365 * 5 + 2)]) expect([startDate, (await post({ startDate })).status]).toEqual([startDate, 422]);
      expect((await post({ startDate: iso(-700) })).status).toBe(201);
      expect((await post({ startDate: iso(365 * 5 - 5) })).status).toBe(201);
      expect((await post({ expiryDate: iso(365 * 20 + 5) })).status).toBe(422);
      expect((await post({ expiryDate: iso(365 * 19) })).status).toBe(201);
    });
  });

  describe('user administration (activate / deactivate / rename)', () => {
    it('deactivation revokes sessions immediately and blocks sign-in; reactivation restores access', async () => {
      const e = email('h.victim'); const u = await create({ name: 'Victim Staff', email: e, password: PW, role: 'STAFF' });
      const ag = request.agent(app); await ag.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: e, password: PW });
      expect((await ag.get('/api/subscriptions')).status).toBe(200);
      const off = await A.admin.put(`/api/users/${u.id}`).send({ isActive: false });
      expect(off.status, JSON.stringify(off.body)).toBe(200); expect(off.body.data).toMatchObject({ id: u.id, isActive: false, role: 'STAFF' });
      expect((await ag.get('/api/subscriptions')).status).toBe(401);
      expect((await ag.get('/api/auth/get-session')).body).toBeNull(); // the Better Auth session is gone too
      expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
      expect((await request(app).post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: e, password: PW })).status).toBeGreaterThanOrEqual(400);
      expect((await A.admin.put(`/api/users/${u.id}`).send({ isActive: true, name: 'Renamed Staff' })).body.data).toMatchObject({ isActive: true, name: 'Renamed Staff' });
      expect((await request(app).post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: e, password: PW })).status).toBe(200);
    });

    it('protects administrators, validates input and is admin-only', async () => {
      expect((await A.admin.put(`/api/users/${ids.admin}`).send({ isActive: false })).status).toBe(409); // cannot lock out the admin (incl. yourself)
      expect((await A.admin.put(`/api/users/${crypto.randomUUID()}`).send({ name: 'Ghost' })).status).toBe(404);
      for (const body of [{}, { role: 'ADMIN' }, { isActive: 'no' }, { name: '' }, { name: 'x', passwordHash: 'y' }]) expect([JSON.stringify(body), (await A.admin.put(`/api/users/${ids.customer}`).send(body)).status]).toEqual([JSON.stringify(body), 422]);
      expect((await A.staff.put(`/api/users/${ids.customer}`).send({ name: 'Nope' })).status).toBe(403);
      expect((await A.customer.put(`/api/users/${ids.customer}`).send({ name: 'Nope' })).status).toBe(403);
      expect((await request(app).put(`/api/users/${ids.customer}`).send({ name: 'Nope' })).status).toBe(401);
    });

    it('will not deactivate a customer who still has live subscriptions', async () => {
      const e = email('h.cust2'); const c = await create({ name: 'Customer Two', email: e, password: PW, role: 'CUSTOMER' });
      const s = (await A.staff.post('/api/subscriptions').send(sub({ customerId: c.id }))).body.data;
      for (const to of ['QUOTATION', 'CONFIRMED', 'ACTIVE']) await A.staff.post(`/api/subscriptions/${s.id}/transition`).send({ to });
      expect((await A.admin.put(`/api/users/${c.id}`).send({ isActive: false })).status).toBe(409);
      await db.subscription.update({ where: { id: s.id }, data: { status: 'CLOSED' } });
      expect((await A.admin.put(`/api/users/${c.id}`).send({ isActive: false })).status).toBe(200);
    });
  });

  describe('payment dates', () => {
    const invoice = async (issue: string) => {
      const subscriptionId = (await db.subscription.create({ data: { number: `SUB/H/${uid()}`, customerId: ids.customer, planId: plan.id, status: 'ACTIVE', startDate: new Date('2026-01-01'), nextInvoiceDate: new Date('2027-01-01'), billingAnchorDay: 1, billingAnchorMonth: 1 } })).id;
      return db.invoice.create({ data: { number: `INV/H/${uid()}`, subscriptionId, customerId: ids.customer, status: 'CONFIRMED', periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-02-01'), issueDate: new Date(issue), dueDate: new Date(iso(30)), customerName: 'C', customerEmail: 'c@x.com', subtotal: '100.00', taxTotal: '0.00', total: '100.00' } });
    };
    it('rejects a payment dated before the invoice was issued, accepts the issue date and the business "today"', async () => {
      const inv = await invoice(iso(-3));
      const pay = (date: string, amount = '10.00') => A.staff.post('/api/payments').send({ invoiceId: inv.id, method: 'UPI', amount, date });
      const early = await pay(iso(-4)); expect(early.status).toBe(422); expect(early.body.error.fields.date[0]).toMatch(/before the invoice issue date/);
      expect((await pay(iso(-3))).status).toBe(201);
      expect((await pay(todayBusiness())).status).toBe(201); // business "today" is always acceptable, even when UTC is still yesterday
    });
  });
});
