import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Integration tests for A-04 (invoices + payments). Needs a disposable local PostgreSQL:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/brightloop_test npm test -w server
// Invoices are inserted directly because the billing engine (B) is a separate workstream.
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Str0ng!Passw';
const uid = () => `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
const email = (tag: string) => `${tag}.${uid()}@example.com`;
const shift = (day: string, days: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!TEST_DB)('invoices and payments (A-04)', () => {
  let app: Express; let db: typeof import('../../src/lib/db.js').db; let invoiceMailer: typeof import('../../src/modules/invoices/mailer.js').invoiceMailer;
  let staff: ReturnType<typeof request.agent>; let customerAgent: ReturnType<typeof request.agent>;
  let staffId: string; let customerId: string; let customerName: string; let planId: string; let subscriptionId: string; let seq = 0;

  type Over = { status?: string; total?: string; amountPaid?: string; dueDate?: string; issueDate?: string; number?: string; customerName?: string; customerEmail?: string };
  async function makeInvoice(o: Over = {}) {
    const total = o.total ?? '1180.00';
    seq += 1;
    return db.invoice.create({
      data: {
        number: o.number ?? `INV/T/${uid()}`, subscriptionId, customerId, status: (o.status ?? 'DRAFT') as never,
        periodStart: new Date(`${2000 + (seq % 90)}-01-${String((seq % 27) + 1).padStart(2, '0')}`), periodEnd: new Date('2099-01-01'),
        issueDate: new Date(o.issueDate ?? ((o.dueDate ?? iso(10)) < iso(-5) ? shift(o.dueDate as string, -5) : iso(-5))), dueDate: new Date(o.dueDate ?? iso(10)),
        customerName: o.customerName ?? customerName, customerEmail: o.customerEmail ?? 'billing@example.com',
        subtotal: total, taxTotal: '0.00', total, amountPaid: o.amountPaid ?? '0.00',
        lines: { create: [{ kind: 'CHARGE', description: 'CRM - Brand: Odoo', quantity: 1, unitPrice: total, subtotal: total, taxTotal: '0.00', total, taxes: [{ taxId: crypto.randomUUID(), name: 'GST 18%', percentage: '18.0000', amount: '0.00' }], position: 0 }] },
      },
    });
  }
  const pay = (invoiceId: string, over: Record<string, unknown> = {}) => staff.post('/api/payments').send({ invoiceId, method: 'UPI', amount: '100.00', date: iso(0), note: 'test', ...over });
  const invoiceOf = async (id: string) => (await staff.get(`/api/invoices/${id}`)).body.data;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js')); ({ db } = await import('../../src/lib/db.js'));
    ({ invoiceMailer } = await import('../../src/modules/invoices/mailer.js'));
    const { createCredentialUser } = await import('../../src/lib/auth.js');
    const staffEmail = email('invstaff'); const customerEmail = email('invcust'); customerName = `Inv Customer ${uid()}`;
    staffId = (await createCredentialUser({ name: 'Inv Staff', email: staffEmail, password: PASSWORD, role: 'STAFF' })).id;
    customerId = (await createCredentialUser({ name: customerName, email: customerEmail, password: PASSWORD, role: 'CUSTOMER' })).id;
    staff = request.agent(app); customerAgent = request.agent(app);
    for (const [agent, e] of [[staff, staffEmail], [customerAgent, customerEmail]] as const) expect((await agent.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: e, password: PASSWORD })).status).toBe(200);
    planId = (await db.plan.create({ data: { name: `InvPlan ${uid()}`, price: '100.00', billingPeriod: 'MONTHLY', minQuantity: 1, autoClose: true, closableEarly: false, pausable: false, renewable: false } })).id;
    subscriptionId = (await db.subscription.create({ data: { number: `SUB/T/${uid()}`, customerId, planId, status: 'ACTIVE', startDate: new Date('2026-01-01'), nextInvoiceDate: new Date('2026-02-01'), billingAnchorDay: 1, billingAnchorMonth: 1 } })).id;
  });
  afterAll(async () => { await db?.$disconnect(); });

  describe('reading', () => {
    it('returns the frozen invoice with lines, tax snapshots, payments and derived outstanding/overdue', async () => {
      const inv = await makeInvoice({ status: 'CONFIRMED', total: '500.00', dueDate: iso(-3) });
      const r = await staff.get(`/api/invoices/${inv.id}`);
      expect(r.status).toBe(200);
      expect(r.body.data).toMatchObject({ id: inv.id, status: 'CONFIRMED', total: '500.00', amountPaid: '0.00', outstanding: '500.00', overdue: true, currency: 'INR', sentAt: null, payments: [], discountUsages: [] });
      expect(r.body.data.lines[0]).toMatchObject({ description: 'CRM - Brand: Odoo', unitPrice: '500.00', taxes: [{ name: 'GST 18%', percentage: '18.0000' }] });
      expect((await staff.get(`/api/invoices/${crypto.randomUUID()}`)).status).toBe(404);
      expect((await staff.get('/api/invoices/not-a-uuid')).status).toBe(422);
    });

    it('defines overdue only for open invoices past their due date', async () => {
      const cases: Array<[Over, boolean, string]> = [
        [{ status: 'CONFIRMED', dueDate: iso(-1) }, true, '1180.00'], [{ status: 'PARTIALLY_PAID', dueDate: iso(-1), amountPaid: '80.00' }, true, '1100.00'],
        [{ status: 'CONFIRMED', dueDate: iso(0) }, false, '1180.00'], [{ status: 'DRAFT', dueDate: iso(-30) }, false, '0.00'],
        [{ status: 'PAID', dueDate: iso(-30), amountPaid: '1180.00' }, false, '0.00'], [{ status: 'CANCELLED', dueDate: iso(-30) }, false, '0.00'],
      ];
      for (const [over, overdue, outstanding] of cases) {
        const d = await invoiceOf((await makeInvoice(over)).id);
        expect([over.status, d.overdue, d.outstanding]).toEqual([over.status, overdue, outstanding]);
      }
    });

    it('filters by status, customer, plan, issue-date range, overdue and search; sorts and paginates', async () => {
      const tag = uid(); const name = `Searchable ${tag}`;
      const overdue = await makeInvoice({ status: 'CONFIRMED', dueDate: iso(-2), customerName: name, issueDate: '2024-06-15' });
      const fresh = await makeInvoice({ status: 'CONFIRMED', dueDate: iso(20), customerName: name, issueDate: '2024-07-15' });
      const draft = await makeInvoice({ status: 'DRAFT', customerName: name, issueDate: '2024-08-15' });
      const ids = (r: { body: { data: Array<{ id: string }> } }) => r.body.data.map(x => x.id).sort();
      const base = `/api/invoices?search=${encodeURIComponent(tag)}`;
      expect(ids(await staff.get(`${base}&pageSize=100`))).toEqual([overdue.id, fresh.id, draft.id].sort());
      expect(ids(await staff.get(`${base}&overdue=true&pageSize=100`))).toEqual([overdue.id]);
      expect(ids(await staff.get(`${base}&overdue=false&pageSize=100`))).toEqual([fresh.id, draft.id].sort());
      expect(ids(await staff.get(`${base}&status=DRAFT&pageSize=100`))).toEqual([draft.id]);
      expect(ids(await staff.get(`${base}&from=2024-07-01&to=2024-07-31&pageSize=100`))).toEqual([fresh.id]);
      expect(ids(await staff.get(`${base}&customerId=${customerId}&planId=${planId}&pageSize=100`))).toHaveLength(3);
      expect(ids(await staff.get(`${base}&planId=${crypto.randomUUID()}&pageSize=100`))).toHaveLength(0);
      const sorted = await staff.get(`${base}&sortBy=date&sortOrder=asc`);
      expect(sorted.body.data.map((x: { id: string }) => x.id)).toEqual([overdue.id, fresh.id, draft.id]);
      const page = await staff.get(`${base}&pageSize=2&page=2&sortBy=date&sortOrder=asc`);
      expect(page.body).toMatchObject({ page: 2, pageSize: 2, total: 3 }); expect(page.body.data).toHaveLength(1);
      expect((await staff.get('/api/invoices?from=2024-02-01&to=2024-01-01')).status).toBe(422);
      expect((await staff.get('/api/invoices?pageSize=1000')).status).toBe(422);
    });
  });

  describe('confirm and cancel', () => {
    it('confirms only DRAFT invoices; a zero-total invoice settles immediately', async () => {
      const a = await makeInvoice(); const r = await staff.post(`/api/invoices/${a.id}/confirm`);
      expect(r.status).toBe(200); expect(r.body.data.status).toBe('CONFIRMED');
      const again = await staff.post(`/api/invoices/${a.id}/confirm`);
      expect(again.status).toBe(409); expect(again.body.error.code).toBe('INVALID_TRANSITION');
      const zero = await makeInvoice({ total: '0.00' });
      expect((await staff.post(`/api/invoices/${zero.id}/confirm`)).body.data).toMatchObject({ status: 'PAID', total: '0.00', outstanding: '0.00' });
      expect((await staff.post(`/api/invoices/${crypto.randomUUID()}/confirm`)).status).toBe(404);
    });

    it('cancels DRAFT and unpaid CONFIRMED invoices only; PAID/CANCELLED/partially paid are final', async () => {
      expect((await staff.post(`/api/invoices/${(await makeInvoice()).id}/cancel`)).body.data.status).toBe('CANCELLED');
      expect((await staff.post(`/api/invoices/${(await makeInvoice({ status: 'CONFIRMED' })).id}/cancel`)).body.data.status).toBe('CANCELLED');
      for (const status of ['CANCELLED', 'PAID']) {
        const r = await staff.post(`/api/invoices/${(await makeInvoice({ status, amountPaid: status === 'PAID' ? '1180.00' : '0.00' })).id}/cancel`);
        expect([status, r.status]).toEqual([status, 409]);
      }
      const partly = await makeInvoice({ status: 'CONFIRMED' }); expect((await pay(partly.id)).status).toBe(201);
      expect((await staff.post(`/api/invoices/${partly.id}/cancel`)).status).toBe(409);
      expect((await staff.post(`/api/invoices/${(await makeInvoice({ status: 'CANCELLED' })).id}/confirm`)).status).toBe(409); // no way back
    });
  });

  describe('payments', () => {
    it('records a full payment: PAID, amountPaid updated, recordedBy is the acting user', async () => {
      const inv = await makeInvoice({ status: 'CONFIRMED', total: '250.00' });
      const r = await pay(inv.id, { amount: '250.00', method: 'BANK_TRANSFER', note: 'wire ref 42' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.data).toMatchObject({ invoiceId: inv.id, method: 'BANK_TRANSFER', amount: '250.00', date: iso(0), note: 'wire ref 42', recordedById: staffId });
      expect(await invoiceOf(inv.id)).toMatchObject({ status: 'PAID', amountPaid: '250.00', outstanding: '0.00', overdue: false });
    });

    it('supports partial payments and then settles; rejects overpayment', async () => {
      const inv = await makeInvoice({ status: 'CONFIRMED', total: '300.00', dueDate: iso(-1) });
      expect((await pay(inv.id, { amount: '100.50' })).status).toBe(201);
      expect(await invoiceOf(inv.id)).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: '100.50', outstanding: '199.50', overdue: true });
      const over = await pay(inv.id, { amount: '199.51' });
      expect(over.status).toBe(422); expect(over.body.error.fields.amount[0]).toMatch(/199\.50/);
      expect((await pay(inv.id, { amount: '199.50', method: 'CASH' })).status).toBe(201);
      const done = await invoiceOf(inv.id);
      expect(done).toMatchObject({ status: 'PAID', amountPaid: '300.00', outstanding: '0.00', overdue: false });
      expect(done.payments.map((p: { amount: string }) => p.amount)).toEqual(['100.50', '199.50']);
      expect((await pay(inv.id, { amount: '0.01' })).status).toBe(409); // already PAID
    });

    it('only accepts payments for CONFIRMED / PARTIALLY_PAID invoices with valid input', async () => {
      for (const status of ['DRAFT', 'CANCELLED', 'PAID']) {
        const r = await pay((await makeInvoice({ status, amountPaid: status === 'PAID' ? '1180.00' : '0.00' })).id);
        expect([status, r.status]).toEqual([status, 409]);
      }
      const inv = await makeInvoice({ status: 'CONFIRMED' });
      expect((await pay(inv.id, { amount: '0.00' })).status).toBe(422);
      expect((await pay(inv.id, { amount: '-5.00' })).status).toBe(422);
      expect((await pay(inv.id, { amount: '10' })).status).toBe(422); // money must have two decimals
      expect((await pay(inv.id, { method: 'BITCOIN' })).status).toBe(422);
      expect((await pay(inv.id, { date: iso(1) })).body.error.fields.date).toBeDefined(); // no future payments
      expect((await pay(crypto.randomUUID())).status).toBe(404);
      expect((await pay(inv.id, { recordedById: customerId })).status).toBe(422); // strict input: cannot forge the recorder
      expect(await db.payment.count({ where: { invoiceId: inv.id } })).toBe(0);
    });

    it('never double-spends under concurrent payments of the full balance', async () => {
      const inv = await makeInvoice({ status: 'CONFIRMED', total: '400.00' });
      const results = await Promise.all(Array.from({ length: 5 }, () => pay(inv.id, { amount: '400.00' })));
      expect(results.filter(r => r.status === 201)).toHaveLength(1);
      expect(results.filter(r => r.status !== 201).every(r => r.status === 409 || r.status === 422)).toBe(true);
      expect(await invoiceOf(inv.id)).toMatchObject({ status: 'PAID', amountPaid: '400.00' });
      expect(await db.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
    });

    it('keeps amountPaid equal to the sum of payments under concurrent partial payments', async () => {
      const inv = await makeInvoice({ status: 'CONFIRMED', total: '100.00' });
      const results = await Promise.all(Array.from({ length: 6 }, () => pay(inv.id, { amount: '30.00' })));
      const ok = results.filter(r => r.status === 201).length;
      expect(ok).toBe(3); // 3 x 30.00 fits in 100.00, the rest are rejected
      expect(await invoiceOf(inv.id)).toMatchObject({ status: 'PARTIALLY_PAID', amountPaid: '90.00', outstanding: '10.00' });
    });

    it('lists payments with filters and pagination', async () => {
      const tag = uid(); const inv = await makeInvoice({ status: 'CONFIRMED', total: '900.00', customerName: `Payer ${tag}` });
      await pay(inv.id, { amount: '100.00', method: 'CASH', date: iso(-2) }); await pay(inv.id, { amount: '200.00', method: 'CARD', date: iso(-1) });
      const q = (extra: string) => staff.get(`/api/payments?invoiceId=${inv.id}${extra}`);
      expect((await q('')).body.total).toBe(2);
      expect((await q('&method=CARD')).body.data.map((p: { amount: string }) => p.amount)).toEqual(['200.00']);
      expect((await q(`&from=${iso(-2)}&to=${iso(-2)}`)).body.data.map((p: { amount: string }) => p.amount)).toEqual(['100.00']);
      expect((await q('&sortBy=date&sortOrder=asc&pageSize=1')).body.data[0].amount).toBe('100.00');
      expect((await staff.get(`/api/payments?customerId=${customerId}&search=${encodeURIComponent(tag)}`)).body.total).toBe(2);
      expect((await staff.get(`/api/payments?customerId=${staffId}`)).body.total).toBe(0);
      expect((await q('&from=2030-02-01&to=2030-01-01')).status).toBe(422);
    });
  });

  describe('send', () => {
    it('emails an issued invoice built from frozen values (escaped) and then sets sentAt', async () => {
      const send = vi.spyOn(invoiceMailer, 'send').mockResolvedValue();
      const inv = await makeInvoice({ status: 'CONFIRMED', customerName: '<script>alert(1)</script> & Co', customerEmail: 'pay@acme.example' });
      const r = await staff.post(`/api/invoices/${inv.id}/send`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.sentAt).not.toBeNull();
      expect(send).toHaveBeenCalledTimes(1);
      const mail = send.mock.calls[0]![0];
      expect(mail.to).toBe('pay@acme.example'); expect(mail.subject).toContain(inv.number);
      expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co'); expect(mail.html).not.toContain('<script>');
      send.mockRestore();
    });

    it('does not mark the invoice as sent when delivery fails, and refuses DRAFT/CANCELLED', async () => {
      const send = vi.spyOn(invoiceMailer, 'send').mockRejectedValue(new Error('smtp down'));
      const inv = await makeInvoice({ status: 'CONFIRMED' });
      const r = await staff.post(`/api/invoices/${inv.id}/send`);
      expect(r.status).toBe(502); expect(r.body.error.code).toBe('EMAIL_FAILED');
      expect((await invoiceOf(inv.id)).sentAt).toBeNull();
      send.mockRestore();
      const quiet = vi.spyOn(invoiceMailer, 'send').mockResolvedValue();
      for (const status of ['DRAFT', 'CANCELLED']) expect([status, (await staff.post(`/api/invoices/${(await makeInvoice({ status })).id}/send`)).status]).toEqual([status, 409]);
      expect(quiet).not.toHaveBeenCalled(); quiet.mockRestore();
    });

    it('fails honestly in production instead of pretending to send', async () => {
      const real = process.env.NODE_ENV; vi.resetModules();
      process.env.NODE_ENV = 'production'; process.env.BETTER_AUTH_SECRET = 'p'.repeat(40);
      try {
        const { invoiceMailer: prod } = await import('../../src/modules/invoices/mailer.js');
        await expect(prod.send({ to: 'a@b.c', subject: 's', html: 'h' })).rejects.toThrow(/not configured/);
      } finally { process.env.NODE_ENV = real; delete process.env.BETTER_AUTH_SECRET; vi.resetModules(); }
    });
  });

  describe('reminders and bulk actions (A-11)', () => {
    const remind = (id: string) => staff.post(`/api/invoices/${id}/remind`).send({});
    const bulk = (action: 'confirm' | 'send' | 'remind', ids: string[]) => staff.post(`/api/invoices/${action}`).send({ ids });
    const overdueInvoice = (over: Over = {}) => makeInvoice({ status: 'CONFIRMED', dueDate: iso(-3), ...over });

    it('emails an overdue invoice reminder (escaped), records it, and throttles to once per 24 hours', async () => {
      const send = vi.spyOn(invoiceMailer, 'send').mockResolvedValue();
      const inv = await overdueInvoice({ customerName: '<b>Evil</b> & Co', customerEmail: 'ap@acme.example', total: '500.00' });
      const r = await remind(inv.id);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ reminderCount: 1, overdue: true, outstanding: '500.00' }); expect(r.body.data.lastReminderAt).not.toBeNull();
      const mail = send.mock.calls[0]![0];
      expect(mail.to).toBe('ap@acme.example'); expect(mail.subject).toContain(inv.number);
      expect(mail.html).toContain('3 days overdue'); expect(mail.html).toContain('&lt;b&gt;Evil&lt;/b&gt; &amp; Co'); expect(mail.html).not.toContain('<b>');
      const again = await remind(inv.id);
      expect(again.status).toBe(409); expect(again.body.error.message).toMatch(/last 24 hours/); expect(send).toHaveBeenCalledTimes(1);
      await db.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: new Date(Date.now() - 25 * 3_600_000) } });
      expect((await remind(inv.id)).body.data.reminderCount).toBe(2); expect(send).toHaveBeenCalledTimes(2);
      send.mockRestore();
    });

    it('only reminds invoices that are actually overdue', async () => {
      const send = vi.spyOn(invoiceMailer, 'send').mockResolvedValue();
      const cases: Array<[Over, RegExp]> = [
        [{ status: 'CONFIRMED', dueDate: iso(5) }, /not yet past due/], [{ status: 'DRAFT', dueDate: iso(-5) }, /DRAFT/],
        [{ status: 'PAID', dueDate: iso(-5), amountPaid: '1180.00' }, /PAID/], [{ status: 'CANCELLED', dueDate: iso(-5) }, /CANCELLED/],
      ];
      for (const [over, message] of cases) { const r = await remind((await makeInvoice(over)).id); expect([over.status, r.status]).toEqual([over.status, 409]); expect(r.body.error.message).toMatch(message); }
      expect((await remind(crypto.randomUUID())).status).toBe(404);
      const partly = await overdueInvoice(); await pay(partly.id, { amount: '100.00', date: iso(0) });
      expect((await remind(partly.id)).body.data).toMatchObject({ status: 'PARTIALLY_PAID', outstanding: '1080.00', reminderCount: 1 }); // still collectible, so it is reminded
      expect(send).toHaveBeenCalledTimes(1); send.mockRestore();
    });

    it('releases the throttle when delivery fails, so the reminder can be retried', async () => {
      const inv = await overdueInvoice();
      const failing = vi.spyOn(invoiceMailer, 'send').mockRejectedValue(new Error('smtp down'));
      const r = await remind(inv.id);
      expect(r.status).toBe(502); expect(r.body.error.code).toBe('EMAIL_FAILED');
      expect(await invoiceOf(inv.id)).toMatchObject({ lastReminderAt: null, reminderCount: 0 }); failing.mockRestore();
      const ok = vi.spyOn(invoiceMailer, 'send').mockResolvedValue();
      expect((await remind(inv.id)).status).toBe(200); expect(ok).toHaveBeenCalledTimes(1); ok.mockRestore();
    });

    it('sends only one reminder when several people click at once', async () => {
      const send = vi.spyOn(invoiceMailer, 'send').mockResolvedValue();
      const inv = await overdueInvoice();
      const rs = await Promise.all(Array.from({ length: 5 }, () => remind(inv.id)));
      expect(rs.filter(r => r.status === 200)).toHaveLength(1); expect(rs.filter(r => r.status === 409)).toHaveLength(4);
      expect(send).toHaveBeenCalledTimes(1); expect((await invoiceOf(inv.id)).reminderCount).toBe(1); send.mockRestore();
    });

    it('bulk confirm processes every invoice independently and reports each failure', async () => {
      const drafts = await Promise.all([makeInvoice(), makeInvoice(), makeInvoice()]); const paid = await makeInvoice({ status: 'PAID', amountPaid: '1180.00' });
      const r = await bulk('confirm', [...drafts.map(d => d.id), paid.id, crypto.randomUUID()]);
      expect(r.status).toBe(200); expect(r.body.data.succeeded).toBe(3);
      expect(r.body.data.failed.map((f: { id: string; code: string }) => [f.id === paid.id ? 'paid' : 'unknown', f.code])).toEqual([['paid', 'INVALID_TRANSITION'], ['unknown', 'NOT_FOUND']]);
      for (const d of drafts) expect((await invoiceOf(d.id)).status).toBe('CONFIRMED');
    });

    it('bulk send and bulk remind report partial success without stopping', async () => {
      const send = vi.spyOn(invoiceMailer, 'send').mockResolvedValue();
      const good = await makeInvoice({ status: 'CONFIRMED' }); const draft = await makeInvoice();
      const s = await bulk('send', [good.id, draft.id]); expect(s.body.data.succeeded).toBe(1); expect(s.body.data.failed).toHaveLength(1); expect((await invoiceOf(good.id)).sentAt).not.toBeNull();
      const late = await overdueInvoice(); const fresh = await makeInvoice({ status: 'CONFIRMED', dueDate: iso(9) });
      const rm = await bulk('remind', [late.id, fresh.id]); expect(rm.body.data.succeeded).toBe(1); expect(rm.body.data.failed[0]).toMatchObject({ id: fresh.id, code: 'CONFLICT' });
      send.mockRestore();
    });

    it('validates bulk input: 1-100 unique ids', async () => {
      for (const ids of [[], Array.from({ length: 101 }, () => crypto.randomUUID()), ['not-a-uuid'], [crypto.randomUUID(), 'x']]) expect((await bulk('confirm', ids as string[])).status).toBe(422);
      const dup = crypto.randomUUID(); expect((await bulk('confirm', [dup, dup])).status).toBe(422);
      expect((await staff.post('/api/invoices/confirm').send({ ids: [crypto.randomUUID()], extra: 1 })).status).toBe(422);
    });
  });

  describe('access control', () => {
    it('is staff/admin only for every invoice and payment endpoint', async () => {
      const inv = await makeInvoice({ status: 'CONFIRMED' });
      const calls: Array<['get' | 'post', string]> = [['get', '/api/invoices'], ['get', `/api/invoices/${inv.id}`], ['post', `/api/invoices/${inv.id}/confirm`], ['post', `/api/invoices/${inv.id}/cancel`], ['post', `/api/invoices/${inv.id}/send`], ['get', '/api/payments'], ['post', '/api/payments']];
      for (const [method, path] of calls) {
        expect((await customerAgent[method](path).send({})).status, `customer ${method} ${path}`).toBe(403);
        expect((await request(app)[method](path).send({})).status, `anon ${method} ${path}`).toBe(401);
      }
      expect((await invoiceOf(inv.id)).status).toBe('CONFIRMED');
    });
  });
  describe('guarded cancelled-invoice reopen', () => {
    async function isolated(status='CANCELLED') {
      const sub=await db.subscription.create({data:{number:`REOPEN/${uid()}`,customerId,planId,status:'CLOSED',startDate:new Date('2026-01-01'),nextInvoiceDate:new Date('2026-03-01'),billingAnchorDay:1,billingAnchorMonth:1}});
      const invoice=await makeInvoice({status});
      return db.invoice.update({where:{id:invoice.id},data:{subscriptionId:sub.id,periodStart:new Date('2026-01-01'),periodEnd:new Date('2026-02-01')}});
    }
    const reopen=(id:string)=>staff.post(`/api/invoices/${id}/reopen`).send({});
    it('requires staff/admin, valid identity and a cancelled invoice',async()=>{
      const inv=await isolated();
      expect((await customerAgent.post(`/api/invoices/${inv.id}/reopen`).send({})).status).toBe(403);
      expect((await request(app).post(`/api/invoices/${inv.id}/reopen`).send({})).status).toBe(401);
      expect((await reopen(crypto.randomUUID())).status).toBe(404);
      expect((await reopen('invalid')).status).toBe(422);
      expect((await reopen((await isolated('CONFIRMED')).id)).status).toBe(409);
    });
    it('allows exactly one concurrent reopen of the same cancelled invoice',async()=>{
      const inv=await isolated();
      const responses=await Promise.all([reopen(inv.id),reopen(inv.id)]);
      expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
      expect((await invoiceOf(inv.id)).status).toBe('DRAFT');
    });
    it('prevents two overlapping cancelled invoices from becoming collectible together',async()=>{
      const a=await isolated();const second=await makeInvoice({status:'CANCELLED'});
      const b=await db.invoice.update({where:{id:second.id},data:{subscriptionId:a.subscriptionId,periodStart:new Date('2026-01-15'),periodEnd:new Date('2026-02-15')}});
      const responses=await Promise.all([reopen(a.id),reopen(b.id)]);
      expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
      expect(await db.invoice.count({where:{subscriptionId:a.subscriptionId,status:'DRAFT'}})).toBe(1);
    });
    it('allows adjacent coverage but refuses any overlapping live period',async()=>{
      const inv=await isolated();const live=await makeInvoice();
      await db.invoice.update({where:{id:live.id},data:{subscriptionId:inv.subscriptionId,periodStart:new Date('2026-02-01'),periodEnd:new Date('2026-03-01')}});
      expect((await reopen(inv.id)).status).toBe(200);
      await staff.post(`/api/invoices/${inv.id}/cancel`).send({});
      await db.invoice.update({where:{id:live.id},data:{periodStart:new Date('2026-01-31')}});
      expect((await reopen(inv.id)).status).toBe(409);
    });
    it('refuses cancellation and reopening after a payment is recorded',async()=>{
      const inv=await isolated('CONFIRMED');
      expect((await pay(inv.id,{amount:'1.00'})).status).toBe(201);
      expect((await staff.post(`/api/invoices/${inv.id}/cancel`).send({})).status).toBe(409);
      expect((await reopen(inv.id)).status).toBe(409);
      expect((await invoiceOf(inv.id)).status).toBe('PARTIALLY_PAID');
    });
  });
});
