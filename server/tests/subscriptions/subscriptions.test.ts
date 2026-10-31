import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Integration tests for A-03 (quotation templates + subscriptions). Needs a disposable local PostgreSQL:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/brightloop_test npm test -w server
// Every test creates its own uniquely named catalog rows and users; nothing is truncated.
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Str0ng!Passw';
const uid = () => `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
const email = (tag: string) => `${tag}.${uid()}@example.com`;
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

describe.skipIf(!TEST_DB)('templates and subscriptions (A-03)', () => {
  let app: Express; let db: typeof import('../../src/lib/db.js').db;
  let staff: ReturnType<typeof request.agent>; let customerAgent: ReturnType<typeof request.agent>;
  let customerId: string; let staffId: string;
  let product: { id: string }; let otherProduct: { id: string }; let odoo: { id: string }; let otherProductVariant: { id: string };
  let plan: { id: string }; // pausable=false, closableEarly=false, renewable=false, minQuantity 2, no window
  let flexPlan: { id: string }; // pausable + closableEarly + renewable

  const makePlan = (data: Record<string, unknown> = {}) => db.plan.create({ data: { name: `Plan ${uid()}`, price: '100.00', billingPeriod: 'MONTHLY', minQuantity: 1, autoClose: true, closableEarly: false, pausable: false, renewable: false, ...data } });
  const body = (over: Record<string, unknown> = {}) => ({ customerId, planId: plan.id, startDate: iso(0), expiryDate: null, paymentTermsDays: 15, lines: [{ productId: product.id, quantity: 2 }], ...over });
  const createSub = async (over: Record<string, unknown> = {}) => { const r = await staff.post('/api/subscriptions').send(body(over)); expect(r.status, JSON.stringify(r.body)).toBe(201); return r.body.data as { id: string; number: string; status: string };  };
  const move = (id: string, to: string, extra: Record<string, unknown> = {}) => staff.post(`/api/subscriptions/${id}/transition`).send({ to, ...extra });
  const activate = async (id: string) => { for (const to of ['QUOTATION', 'CONFIRMED', 'ACTIVE']) expect((await move(id, to)).status).toBe(200); };
  // Test setup settles actual active service before exercising pause/close policy.
  // Other suites share this DB, so run only this fixture subscription.
  const settle = async (id: string, asOfDate = iso(0)) => {
    const { createBillingService } = await import('../../src/modules/billing-engine/service.js');
    const others = await db.subscription.findMany({ where: { id: { not: id } }, select: { id:true } });
    const result = await createBillingService(db).runBilling({ asOfDate, maxPeriodsPerSubscription:120 },{ excludeSubscriptionIds:others.map(row=>row.id) });
    expect(result.failures).toEqual([]);
  };


  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js')); ({ db } = await import('../../src/lib/db.js'));
    const { createCredentialUser } = await import('../../src/lib/auth.js');
    const staffEmail = email('substaff'); const customerEmail = email('subcust');
    staffId = (await createCredentialUser({ name: 'Sub Staff', email: staffEmail, password: PASSWORD, role: 'STAFF' })).id;
    customerId = (await createCredentialUser({ name: 'Sub Customer', email: customerEmail, password: PASSWORD, role: 'CUSTOMER' })).id;
    staff = request.agent(app); customerAgent = request.agent(app);
    for (const [agent, e] of [[staff, staffEmail], [customerAgent, customerEmail]] as const) expect((await agent.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: e, password: PASSWORD })).status).toBe(200);
    product = await db.product.create({ data: { name: `CRM ${uid()}`, salesPrice: '1000.00', costPrice: '400.00' } });
    otherProduct = await db.product.create({ data: { name: `Other ${uid()}`, salesPrice: '50.00', costPrice: '10.00' } });
    odoo = await db.productVariant.create({ data: { productId: product.id, attribute: 'Brand', value: 'Odoo', extraPrice: '560.00' } });
    otherProductVariant = await db.productVariant.create({ data: { productId: otherProduct.id, attribute: 'Brand', value: 'X', extraPrice: '1.00' } });
    plan = await makePlan({ minQuantity: 2 });
    flexPlan = await makePlan({ pausable: true, closableEarly: true, renewable: true });
  });
  afterAll(async () => { await db?.$disconnect(); });

  describe('quotation templates', () => {
    it('creates, reads, edits and deactivates a template; unset prices inherit from the catalog', async () => {
      const created = await staff.post('/api/quotation-templates').send({ name: `Tpl ${uid()}`, planId: plan.id, validityDays: 30, lines: [{ productId: product.id, variantId: odoo.id, quantity: 3 }, { productId: otherProduct.id, quantity: 1, unitPrice: '45.00' }] });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const t = created.body.data;
      expect(t.lines.map((l: { unitPrice: string | null }) => l.unitPrice)).toEqual([null, '45.00']);
      expect(t.lines.map((l: { position: number }) => l.position)).toEqual([0, 1]);
      expect((await staff.get(`/api/quotation-templates/${t.id}`)).body.data.id).toBe(t.id);
      const edited = await staff.put(`/api/quotation-templates/${t.id}`).send({ name: 'Renamed', planId: plan.id, validityDays: 10, lines: [{ productId: product.id, quantity: 5 }] });
      expect(edited.status).toBe(200); expect(edited.body.data).toMatchObject({ name: 'Renamed', validityDays: 10 }); expect(edited.body.data.lines).toHaveLength(1);
      expect((await staff.delete(`/api/quotation-templates/${t.id}`)).status).toBe(204);
      expect((await staff.get(`/api/quotation-templates/${t.id}`)).body.data.isActive).toBe(false);
      const list = await staff.get('/api/quotation-templates?search=Renamed&pageSize=5');
      expect(list.status).toBe(200); expect(list.body.data.some((x: { id: string }) => x.id === t.id)).toBe(true);
    });

    it('rejects inactive plans, products and a variant of another product', async () => {
      const inactivePlan = await makePlan({ isActive: false }); const inactiveProduct = await db.product.create({ data: { name: `Off ${uid()}`, salesPrice: '1.00', costPrice: '1.00', isActive: false } });
      const post = (over: Record<string, unknown>) => staff.post('/api/quotation-templates').send({ name: 'T', planId: plan.id, validityDays: 5, lines: [{ productId: product.id, quantity: 1 }], ...over });
      expect((await post({ planId: inactivePlan.id })).body.error.fields.planId).toBeDefined();
      expect((await post({ lines: [{ productId: inactiveProduct.id, quantity: 1 }] })).body.error.fields['lines.0.productId']).toBeDefined();
      expect((await post({ lines: [{ productId: product.id, variantId: otherProductVariant.id, quantity: 1 }] })).body.error.fields['lines.0.variantId']).toBeDefined();
      expect((await post({ planId: crypto.randomUUID() })).status).toBe(422);
      expect((await staff.get(`/api/quotation-templates/${crypto.randomUUID()}`)).status).toBe(404);
    });

    it('is staff/admin only', async () => {
      expect((await customerAgent.get('/api/quotation-templates')).status).toBe(403);
      expect((await request(app).get('/api/quotation-templates')).status).toBe(401);
    });
  });

  describe('create / price resolution / validation', () => {
    it('creates a DRAFT with a numbered SUB, schedule anchored to the start date, and frozen resolved prices', async () => {
      const r = await staff.post('/api/subscriptions').send(body({ startDate: '2026-01-31', lines: [{ productId: product.id, variantId: odoo.id, quantity: 2 }, { productId: product.id, variantId: odoo.id, quantity: 1, unitPrice: '900.00' }] }));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const s = r.body.data;
      expect(s).toMatchObject({ status: 'DRAFT', startDate: '2026-01-31', nextInvoiceDate: '2026-01-31', billingAnchorDay: 31, billingAnchorMonth: 1, templateId: null, expiryDate: null });
      expect(s.number).toMatch(/^SUB\/\d{4}\/\d{5}$/);
      expect(s.lines[0].unitPrice).toBe('1560.00'); // 1000 + 560, once
      expect(s.lines[1].unitPrice).toBe('900.00'); // explicit price is final: variant extra NOT added again
      expect(s.lines[0].description).toContain('Brand: Odoo');
      expect(s.history).toEqual([]);
      expect(s.allowedTransitions).toEqual(['QUOTATION', 'CLOSED']);
    });

    it('assigns unique sequential-style numbers under parallel creation', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => staff.post('/api/subscriptions').send(body())));
      expect(results.every(r => r.status === 201)).toBe(true);
      const numbers = results.map(r => r.body.data.number as string);
      expect(new Set(numbers).size).toBe(6);
    });

    it('enforces customer, plan window, minimum quantity, catalog and date rules', async () => {
      const windowed = await makePlan({ availableFrom: new Date(iso(400)), availableTo: new Date(iso(700)) });
      const inactiveCustomer = await db.user.create({ data: { name: 'Inactive C', email: email('inactive'), role: 'CUSTOMER', isActive: false } });
      const post = (over: Record<string, unknown>) => staff.post('/api/subscriptions').send(body(over));
      expect((await post({ customerId: staffId })).body.error.fields.customerId).toBeDefined(); // staff account is not a customer
      expect((await post({ customerId: inactiveCustomer.id })).body.error.fields.customerId).toBeDefined();
      expect((await post({ lines: [{ productId: product.id, quantity: 1 }] })).body.error.fields.lines[0]).toMatch(/minimum of 2/); // plan.minQuantity = 2
      expect((await post({ lines: [{ productId: product.id, quantity: 1 }, { productId: otherProduct.id, quantity: 1 }] })).status).toBe(201); // quantities add up across products
      expect((await post({ planId: windowed.id, startDate: iso(0) })).body.error.fields.startDate).toBeDefined();
      expect((await post({ planId: windowed.id, startDate: iso(400) })).status).toBe(201); // window is inclusive
      expect((await post({ planId: windowed.id, startDate: iso(700) })).status).toBe(201);
      expect((await post({ startDate: '2026-05-10', expiryDate: '2026-05-09' })).status).toBe(422);
      expect((await post({ lines: [] })).status).toBe(422);
      expect((await post({ lines: [{ productId: product.id, variantId: otherProductVariant.id, quantity: 2 }] })).body.error.fields['lines.0.variantId']).toBeDefined();
    });
  });

  describe('from template', () => {
    it('copies lines, links the template, leaves the term open-ended and freezes prices', async () => {
      const t = (await staff.post('/api/quotation-templates').send({ name: `FT ${uid()}`, planId: plan.id, validityDays: 30, lines: [{ productId: product.id, variantId: odoo.id, quantity: 2 }] })).body.data;
      const r = await staff.post('/api/subscriptions/from-template').send({ templateId: t.id, customerId, startDate: '2026-03-01', paymentTermsDays: 30 });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const s = r.body.data;
      expect(s).toMatchObject({ status: 'DRAFT', templateId: t.id, planId: plan.id, startDate: '2026-03-01', expiryDate: null, nextInvoiceDate: '2026-03-01', paymentTermsDays: 30, quotationValidityDays: 30 });
      expect(s.lines[0]).toMatchObject({ quantity: 2, unitPrice: '1560.00' });
      await db.product.update({ where: { id: product.id }, data: { salesPrice: '2000.00' } });
      expect((await staff.get(`/api/subscriptions/${s.id}`)).body.data.lines[0].unitPrice).toBe('1560.00'); // later catalog changes never touch it
      await db.product.update({ where: { id: product.id }, data: { salesPrice: '1000.00' } });
      await staff.delete(`/api/quotation-templates/${t.id}`);
      expect((await staff.get(`/api/subscriptions/${s.id}`)).status).toBe(200); // subscription survives template deactivation
      expect((await staff.post('/api/subscriptions/from-template').send({ templateId: t.id, customerId, startDate: '2026-03-01', paymentTermsDays: 0 })).body.error.fields.templateId).toBeDefined();
    });
  });

  describe('edit and delete', () => {
    it('edits only DRAFT/QUOTATION and recomputes the schedule from the new start date', async () => {
      const s = await createSub({ startDate: '2026-01-31' });
      const edited = await staff.put(`/api/subscriptions/${s.id}`).send(body({ startDate: '2026-02-10', paymentTermsDays: 45, lines: [{ productId: otherProduct.id, quantity: 4 }] }));
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.data).toMatchObject({ number: s.number, startDate: '2026-02-10', nextInvoiceDate: '2026-02-10', billingAnchorDay: 10, billingAnchorMonth: 2, paymentTermsDays: 45 });
      expect(edited.body.data.lines).toHaveLength(1);
      expect((await move(s.id, 'QUOTATION')).status).toBe(200);
      expect((await staff.put(`/api/subscriptions/${s.id}`).send(body())).status).toBe(200);
      expect((await move(s.id, 'CONFIRMED')).status).toBe(200);
      expect((await staff.put(`/api/subscriptions/${s.id}`).send(body())).status).toBe(409);
    });

    it('hard-deletes only DRAFT subscriptions without invoices', async () => {
      const draft = await createSub();
      expect((await staff.delete(`/api/subscriptions/${draft.id}`)).status).toBe(204);
      expect((await staff.get(`/api/subscriptions/${draft.id}`)).status).toBe(404);
      expect((await staff.delete(`/api/subscriptions/${draft.id}`)).status).toBe(404);
      const quoted = await createSub(); await move(quoted.id, 'QUOTATION');
      expect((await staff.delete(`/api/subscriptions/${quoted.id}`)).status).toBe(409);
      const withInvoice = await createSub();
      await db.invoice.create({ data: { number: `INV/T/${uid()}`, subscriptionId: withInvoice.id, customerId, periodStart: new Date(iso(0)), periodEnd: new Date(iso(30)), issueDate: new Date(iso(0)), dueDate: new Date(iso(15)), customerName: 'C', customerEmail: 'c@example.com', subtotal: '10.00', taxTotal: '0.00', total: '10.00' } });
      expect((await staff.delete(`/api/subscriptions/${withInvoice.id}`)).status).toBe(409);
    });
  });

  describe('state machine and history', () => {
    it('walks DRAFT -> QUOTATION -> CONFIRMED -> ACTIVE, recording actor and reason for each step', async () => {
      const s = await createSub();
      expect((await move(s.id, 'ACTIVE')).body.error.code).toBe('INVALID_TRANSITION'); // cannot skip steps
      expect((await move(s.id, 'DRAFT')).status).toBe(409); // same state
      const r1 = await move(s.id, 'QUOTATION', { reason: 'sent to customer' });
      expect(r1.body.data.status).toBe('QUOTATION');
      await move(s.id, 'CONFIRMED'); const done = await move(s.id, 'ACTIVE');
      const h = done.body.data.history;
      expect(h.map((e: { fromStatus: string; toStatus: string }) => `${e.fromStatus}>${e.toStatus}`)).toEqual(['DRAFT>QUOTATION', 'QUOTATION>CONFIRMED', 'CONFIRMED>ACTIVE']);
      expect(h[0]).toMatchObject({ actorId: staffId, reason: 'sent to customer' });
      expect(done.body.data.allowedTransitions).toEqual([]); // plan is not pausable/closable early
      expect((await move(s.id, 'DRAFT')).body.error.code).toBe('INVALID_TRANSITION');
    });

    it('revalidates before moving forward (plan deactivated after the draft was created)', async () => {
      const p = await makePlan(); const s = await createSub({ planId: p.id });
      await db.plan.update({ where: { id: p.id }, data: { isActive: false } });
      expect((await move(s.id, 'QUOTATION')).body.error.fields.planId).toBeDefined();
      expect((await move(s.id, 'CLOSED')).status).toBe(200); // cancelling is still allowed
    });

    it('allows pause/resume only when the plan is pausable', async () => {
      const fixed = await createSub(); await activate(fixed.id);
      expect((await move(fixed.id, 'PAUSED')).body.error.code).toBe('INVALID_TRANSITION');
      const flex = await createSub({ planId: flexPlan.id, lines: [{ productId: product.id, quantity: 1 }] }); await activate(flex.id);
      expect((await move(flex.id, 'PAUSED')).body.data.status).toBe('PAUSED');
      expect(await db.invoice.count({where:{subscriptionId:flex.id}})).toBe(1);
      expect(await db.invoice.count({where:{subscriptionId:fixed.id}})).toBe(0);
      expect((await move(flex.id, 'ACTIVE')).body.data.status).toBe('ACTIVE');
    });

    it('closes early only when the plan allows it, but always once expired', async () => {
      const locked = await createSub(); await activate(locked.id);
      expect((await move(locked.id, 'CLOSED')).body.error.code).toBe('INVALID_TRANSITION');
      const early = await createSub({ planId: flexPlan.id, lines: [{ productId: product.id, quantity: 1 }] }); await activate(early.id);
      expect((await move(early.id, 'CLOSED')).body.data.status).toBe('CLOSED');
      expect(await db.invoice.count({where:{subscriptionId:early.id}})).toBe(1);
      const expired = await createSub({ startDate: iso(-600), expiryDate: iso(-300) }); await activate(expired.id);
      expect((await move(expired.id, 'CLOSED', { reason: 'expired' })).body.data.status).toBe('CLOSED');
      expect(await db.invoice.count({where:{subscriptionId:expired.id}})).toBeGreaterThan(1);
    });

    it('renews a closed subscription only if renewable, with a valid renewalExpiryDate, starting a fresh schedule without back-billing closed gaps', async () => {
      const s = await createSub({ planId: flexPlan.id, startDate: iso(-600), expiryDate: iso(-300), lines: [{ productId: product.id, quantity: 1 }] });
      await activate(s.id); await settle(s.id, iso(-300)); expect((await move(s.id, 'PAUSED')).status).toBe(200);
      expect((await move(s.id, 'ACTIVE')).body.error.code).toBe('INVALID_TRANSITION'); // expired: renew, don't resume
      expect((await move(s.id, 'CLOSED')).status).toBe(200);
      expect((await move(s.id, 'ACTIVE')).body.error.message).toMatch(/renewalExpiryDate is required/);
      expect((await move(s.id, 'ACTIVE', { renewalExpiryDate: iso(-299) })).status).toBe(409); // not later than today
      const renewed = await move(s.id, 'ACTIVE', { renewalExpiryDate: iso(365) });
      expect(renewed.status, JSON.stringify(renewed.body)).toBe(200);
      expect(renewed.body.data).toMatchObject({ status: 'ACTIVE', expiryDate: iso(365), nextInvoiceDate: iso(0) }); // closed gaps are waived; anchors restart today
      const fixed = await createSub({ startDate: iso(-600), expiryDate: iso(-300) }); await activate(fixed.id); await settle(fixed.id, iso(-300)); await move(fixed.id, 'CLOSED');
      expect((await move(fixed.id, 'ACTIVE', { renewalExpiryDate: iso(365) })).body.error.message).toMatch(/cannot be renewed/);
    });

    it('lets exactly one of two concurrent identical transitions win and records one history event', async () => {
      const s = await createSub();
      const [a, b] = await Promise.all([move(s.id, 'QUOTATION'), move(s.id, 'QUOTATION')]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((await staff.get(`/api/subscriptions/${s.id}`)).body.data.history).toHaveLength(1);
    });
  });

  describe('lifecycle: price lock, cancel at period end, seat changes (A-11)', () => {
    const live = async (over: Record<string, unknown> = {}) => { const s = await createSub({ planId: flexPlan.id, startDate: iso(-10), lines: [{ productId: product.id, quantity: 1 }], ...over }); await activate(s.id); return s.id; };
    const view = async (id: string) => (await staff.get(`/api/subscriptions/${id}`)).body.data;
    const schedule = (id: string, b: Record<string, unknown> = {}) => staff.post(`/api/subscriptions/${id}/schedule-cancellation`).send(b);
    const unschedule = (id: string) => staff.post(`/api/subscriptions/${id}/unschedule-cancellation`).send({});
    const change = (id: string, lines: unknown[], extra: Record<string, unknown> = {}) => staff.post(`/api/subscriptions/${id}/change-lines`).send({ lines, ...extra });
    const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

    it('locks the plan price at creation, ignores later plan price changes, re-snapshots on edit and re-prices on renewal', async () => {
      const p = await makePlan({ price: '10.00', closableEarly: true, renewable: true });
      const s = await createSub({ planId: p.id, startDate: iso(-5), lines: [{ productId: product.id, quantity: 1 }] });
      expect((s as unknown as { planPrice: string }).planPrice).toBe('10.00');
      await db.plan.update({ where: { id: p.id }, data: { price: '99.00' } });
      expect((await view(s.id)).planPrice).toBe('10.00'); // running subscriptions are grandfathered
      const edited = await staff.put(`/api/subscriptions/${s.id}`).send(body({ planId: p.id, startDate: iso(-5), lines: [{ productId: product.id, quantity: 1 }] }));
      expect(edited.body.data.planPrice).toBe('99.00'); // editing a draft re-snapshots the current fee
      await db.plan.update({ where: { id: p.id }, data: { price: '120.00' } });
      await activate(s.id); await settle(s.id); expect((await view(s.id)).planPrice).toBe('99.00');
      const first=await db.invoice.findFirstOrThrow({where:{subscriptionId:s.id},include:{lines:true}});
      expect(first.lines.find(l=>l.productId===null)!.unitPrice.toFixed(2)).toBe('99.00');
      expect((await move(s.id, 'CLOSED')).status).toBe(200);
      const renewed = await move(s.id, 'ACTIVE', { renewalExpiryDate: iso(400) });
      expect(renewed.body.data.planPrice).toBe('120.00'); // a new term picks up the current price
      await settle(s.id,renewed.body.data.nextInvoiceDate);
      const latest=await db.invoice.findFirstOrThrow({where:{subscriptionId:s.id},orderBy:{periodStart:'desc'},include:{lines:true}});
      expect(latest.lines.find(l=>l.productId===null)!.unitPrice.toFixed(2)).toBe('120.00');
      expect((await db.invoice.findUniqueOrThrow({where:{id:first.id},include:{lines:true}})).lines).toEqual(first.lines);
    });

    // Regression: resume/renew must honor a future start date and the database schedule constraint.
    it('resumes and renews future subscriptions at startDate without invoicing early', async () => {
      const id=await live({startDate:iso(10),expiryDate:iso(100)});
      expect((await move(id,'PAUSED')).status).toBe(200);
      const resumed=await move(id,'ACTIVE');
      expect(resumed.status,JSON.stringify(resumed.body)).toBe(200);
      expect(resumed.body.data).toMatchObject({nextInvoiceDate:iso(10),billingAnchorDay:Number(iso(10).slice(8)),billingAnchorMonth:Number(iso(10).slice(5,7))});
      expect((await move(id,'CLOSED')).status).toBe(200);
      const renewed=await move(id,'ACTIVE',{renewalExpiryDate:iso(400)});
      expect(renewed.status,JSON.stringify(renewed.body)).toBe(200);
      expect(renewed.body.data.nextInvoiceDate).toBe(iso(10));
      expect(await db.invoice.count({where:{subscriptionId:id}})).toBe(0);
    });

    it('flags billingDue until billing has run', async () => {
      const id = await live(); expect((await view(id)).billingDue).toBe(true);
      await settle(id); expect((await view(id)).billingDue).toBe(false);
      const future = await createSub({ startDate: iso(30) }); await activate(future.id); expect((await view(future.id)).billingDue).toBe(false);
    });

    it('cancels at period end: expiry moves to the last invoiced day, billing stops, the subscription auto-closes', async () => {
      const id = await live();
      const upcoming = await view(id);
      expect(upcoming.billingDue).toBe(true);
      const r = await schedule(id, { reason: 'customer request' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const afterBilling = await view(id);
      expect(afterBilling.billingDue).toBe(false);
      expect(r.body.data).toMatchObject({ status: 'ACTIVE', cancelAtPeriodEnd: true, expiryDate: dayBefore(afterBilling.nextInvoiceDate) });
      expect(r.body.data.history.at(-1)).toMatchObject({ fromStatus: 'ACTIVE', toStatus: 'ACTIVE', actorId: staffId });
      expect(r.body.data.history.at(-1).reason).toMatch(/Cancellation scheduled: ends .*customer request/);
      expect((await schedule(id)).status).toBe(409); // already scheduled
      await settle(id, iso(90)); // far in the future: nothing more may be invoiced, then autoClose applies
      const after = await db.subscription.findUniqueOrThrow({ where: { id }, include: { invoices: true } });
      expect(after.status).toBe('CLOSED'); expect(after.invoices).toHaveLength(1);
    });

    it('withdraws a scheduled cancellation, restoring the original expiry, and billing carries on', async () => {
      const id = await live(); await settle(id); await schedule(id);
      const r = await unschedule(id);
      expect(r.status, JSON.stringify(r.body)).toBe(200); expect(r.body.data).toMatchObject({ cancelAtPeriodEnd: false, expiryDate: null, status: 'ACTIVE' });
      await settle(id, iso(75));
      const row = await db.subscription.findUniqueOrThrow({ where: { id }, include: { invoices: true } });
      expect(row.status).toBe('ACTIVE'); expect(row.invoices.length).toBeGreaterThanOrEqual(3);
      expect((await unschedule(id)).status).toBe(409); // nothing scheduled any more
    });

    it('refuses to schedule when it makes no sense', async () => {
      const strict = await createSub(); await activate(strict.id); await settle(strict.id);
      expect((await schedule(strict.id)).body.error.message).toMatch(/does not allow ending before/); // plan.closableEarly = false
      const draft = await createSub({ planId: flexPlan.id }); expect((await schedule(draft.id)).status).toBe(409);
      const untouched = await createSub({ planId: flexPlan.id, startDate: iso(20) }); await activate(untouched.id);
      expect((await schedule(untouched.id)).body.error.message).toMatch(/Nothing has been invoiced yet/);
      const short = await live({ expiryDate: iso(12) }); await settle(short);
      expect((await schedule(short)).body.error.message).toMatch(/already ends on/);
    });

    it('cannot withdraw after the end date has passed, and renewal clears a schedule', async () => {
      const id = await live(); await settle(id); await schedule(id);
      await db.subscription.update({ where: { id }, data: { expiryDate: new Date(iso(-1)) } });
      expect((await unschedule(id)).body.error.message).toMatch(/already passed/);
      await db.subscription.update({ where: { id }, data: { expiryDate: new Date(iso(30)) } });
      expect((await move(id, 'CLOSED')).status).toBe(200);
      const renewed = await move(id, 'ACTIVE', { renewalExpiryDate: iso(400) });
      expect(renewed.body.data).toMatchObject({ cancelAtPeriodEnd: false, expiryDate: iso(400) });
    });

    it('lets exactly one of two concurrent cancellation schedules win', async () => {
      const id = await live(); await settle(id);
      const [a, b] = await Promise.all([schedule(id), schedule(id)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('changes seats from the NEXT invoice only; issued invoices stay frozen', async () => {
      const id = await live();
      expect((await view(id)).billingDue).toBe(true);
      const r = await change(id, [{ productId: product.id, variantId: odoo.id, quantity: 5 }], { reason: 'seat increase' });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data.lines).toHaveLength(1); expect(r.body.data.lines[0]).toMatchObject({ quantity: 5, unitPrice: '1560.00' });
      expect(r.body.data.history.at(-1)).toMatchObject({ fromStatus: 'ACTIVE', toStatus: 'ACTIVE', actorId: staffId });
      expect(r.body.data.history.at(-1).reason).toMatch(/Lines changed, effective from the next invoice.*seat increase/);
      await settle(id, iso(40));
      const invoices = await db.invoice.findMany({ where: { subscriptionId: id }, include: { lines: true }, orderBy: { periodStart: 'asc' } });
      expect(invoices).toHaveLength(2);
      const productLine = (i: (typeof invoices)[number]) => i.lines.find(l => l.productId === product.id)!;
      expect([productLine(invoices[0]!).quantity, productLine(invoices[0]!).unitPrice.toFixed(2)]).toEqual([1, '1000.00']); // first invoice unchanged
      expect([productLine(invoices[1]!).quantity, productLine(invoices[1]!).unitPrice.toFixed(2)]).toEqual([5, '1560.00']); // second uses the new seats
    });

    it('validates seat changes and only allows them in the right states', async () => {
      const strict = await createSub(); await activate(strict.id); await settle(strict.id); // plan minimum is 2
      expect((await change(strict.id, [{ productId: product.id, quantity: 1 }])).body.error.fields.lines[0]).toMatch(/minimum of 2/);
      expect((await change(strict.id, [{ productId: crypto.randomUUID(), quantity: 3 }])).body.error.fields['lines.0.productId']).toBeDefined();
      expect((await change(strict.id, [{ productId: product.id, quantity: 1000000, unitPrice: '999999999999.99' }])).status).toBe(422);
      expect((await change(strict.id, [])).status).toBe(422);
      const draft = await createSub(); expect((await change(draft.id, [{ productId: product.id, quantity: 2 }])).status).toBe(409);
      const closed = await createSub({ planId: flexPlan.id, startDate: iso(15) }); await activate(closed.id); await move(closed.id, 'CLOSED');
      expect((await change(closed.id, [{ productId: product.id, quantity: 2 }])).status).toBe(409);
      const paused = await live(); await settle(paused); await move(paused, 'PAUSED');
      expect((await change(paused, [{ productId: product.id, quantity: 4 }])).status).toBe(200); // adjusting seats while paused is fine
    });

    it('serialises concurrent seat changes into a consistent single line set', async () => {
      const id = await live(); await settle(id);
      const rs = await Promise.all([change(id, [{ productId: product.id, quantity: 2 }]), change(id, [{ productId: product.id, quantity: 3 }]), change(id, [{ productId: product.id, quantity: 4 }])]);
      expect(rs.every(r => r.status === 200)).toBe(true);
      const lines = await db.subscriptionLine.findMany({ where: { subscriptionId: id } });
      expect(lines).toHaveLength(1); expect([2, 3, 4]).toContain(lines[0]!.quantity);
    });
  });

  describe('line taxes and amounts (A-12)', () => {
    // Own taxed catalog so the shared product/plan used by the other tests keep their (untaxed) behaviour.
    const taxed = async () => {
      const gst = await db.tax.create({ data: { name: `GST18 ${uid()}`, percentage: '18' } });
      const p = await db.product.create({ data: { name: `Taxed ${uid()}`, salesPrice: '1000.00', costPrice: '400.00', taxes: { connect: { id: gst.id } } } });
      const v = await db.productVariant.create({ data: { productId: p.id, attribute: 'Brand', value: 'Odoo', extraPrice: '560.00' } });
      const pl = await makePlan({ price: '500.00', closableEarly: true, taxes: { connect: { id: gst.id } } });
      return { gst, p, v, pl };
    };

    it('shows each line with its taxes and amount, the plan fee, and the per-period total (before discounts)', async () => {
      const { gst, p, v, pl } = await taxed();
      const r = await staff.post('/api/subscriptions').send(body({ planId: pl.id, lines: [{ productId: p.id, variantId: v.id, quantity: 2 }, { productId: product.id, quantity: 1, unitPrice: '100.00' }] }));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const s = r.body.data;
      expect(s.lines[0]).toMatchObject({ quantity: 2, unitPrice: '1560.00', subtotal: '3120.00', taxTotal: '561.60', total: '3681.60' });
      expect(s.lines[0].taxes).toEqual([{ name: gst.name, percentage: '18', amount: '561.60' }]);
      expect(s.lines[1]).toMatchObject({ subtotal: '100.00', taxTotal: '0.00', total: '100.00', taxes: [] }); // untaxed product
      expect(s.planFee).toMatchObject({ description: expect.any(String), quantity: 1, unitPrice: '500.00', subtotal: '500.00', taxTotal: '90.00', total: '590.00' });
      expect(s.estimate).toEqual({ subtotal: '3720.00', taxTotal: '651.60', total: '4371.60' });
    });

    it('uses the locked plan fee, and the estimate equals the real first invoice (same calculator)', async () => {
      const { p, v, pl } = await taxed();
      const s = (await staff.post('/api/subscriptions').send(body({ planId: pl.id, startDate: iso(-5), lines: [{ productId: p.id, variantId: v.id, quantity: 2 }] }))).body.data;
      await db.plan.update({ where: { id: pl.id }, data: { price: '999.00' } }); // a later plan price change must not move the estimate
      expect((await staff.get(`/api/subscriptions/${s.id}`)).body.data.planFee.unitPrice).toBe('500.00');
      await activate(s.id); await settle(s.id);
      const invoice = await db.invoice.findFirstOrThrow({ where: { subscriptionId: s.id } });
      expect(invoice.subtotal.toFixed(2)).toBe(s.estimate.subtotal); // 3,620.00: plan fee + lines, whatever discounts exist elsewhere
      if (invoice.discountTotal.isZero()) { expect(invoice.taxTotal.toFixed(2)).toBe(s.estimate.taxTotal); expect(invoice.total.toFixed(2)).toBe(s.estimate.total); }
    });

    it('ignores deactivated taxes, exactly like billing does', async () => {
      const { gst, p, pl } = await taxed();
      await db.tax.update({ where: { id: gst.id }, data: { isActive: false } });
      const s = (await staff.post('/api/subscriptions').send(body({ planId: pl.id, lines: [{ productId: p.id, quantity: 2 }] }))).body.data;
      expect(s.lines[0]).toMatchObject({ taxTotal: '0.00', taxes: [] }); expect(s.estimate.taxTotal).toBe('0.00');
    });
  });

  describe('quotation validity (A-12)', () => {
    const template = async (validityDays = 30) => (await staff.post('/api/quotation-templates').send({ name: `QV ${uid()}`, planId: plan.id, validityDays, lines: [{ productId: product.id, quantity: 2 }] })).body.data;
    const fromTemplate = async (t: { id: string }, over: Record<string, unknown> = {}) => staff.post('/api/subscriptions/from-template').send({ templateId: t.id, customerId, startDate: iso(0), paymentTermsDays: 15, ...over });
    const addDaysIso = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

    it('the template days are the quote\'s validity, not the subscription\'s end date', async () => {
      const t = await template(14); const r = await fromTemplate(t, { startDate: '2026-03-01' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.data).toMatchObject({ status: 'DRAFT', expiryDate: null, quotationValidityDays: 14, quotationValidUntil: null, quotationExpired: false }); // the customer chooses the term, not the template
      const dated = await fromTemplate(t, { expiryDate: iso(400) });
      expect(dated.body.data.expiryDate).toBe(iso(400));
      expect((await fromTemplate(t, { startDate: '2026-05-10', expiryDate: '2026-05-09' })).status).toBe(422);
      const manual = await createSub(); expect(manual).toMatchObject({ quotationValidityDays: null, quotationValidUntil: null });
    });

    it('starts the validity window when the quotation is sent, and only counts for template quotes', async () => {
      const s = (await fromTemplate(await template(14))).body.data;
      const sent = await move(s.id, 'QUOTATION');
      expect(sent.body.data).toMatchObject({ status: 'QUOTATION', quotationValidUntil: addDaysIso((await import('../../src/lib/dates.js')).todayBusiness(), 14), quotationExpired: false });
      const manual = await createSub(); const sentManual = await move(manual.id, 'QUOTATION'); expect(sentManual.body.data.quotationValidUntil).toBeNull();
    });

    it('refuses to confirm an expired quotation, hides the button, but still allows closing', async () => {
      const s = (await fromTemplate(await template(30))).body.data; await move(s.id, 'QUOTATION');
      await db.subscription.update({ where: { id: s.id }, data: { quotationValidUntil: new Date(iso(-1)) } });
      const view = (await staff.get(`/api/subscriptions/${s.id}`)).body.data;
      expect(view).toMatchObject({ quotationExpired: true }); expect(view.allowedTransitions).not.toContain('CONFIRMED'); expect(view.allowedTransitions).toContain('CLOSED');
      const refused = await move(s.id, 'CONFIRMED'); expect(refused.status).toBe(409); expect(refused.body.error.code).toBe('QUOTATION_EXPIRED'); expect(refused.body.error.message).toMatch(/expired on/);
      expect((await move(s.id, 'CLOSED')).status).toBe(200);
    });

    it('editing an expired quotation re-issues it, after which it can be confirmed', async () => {
      const s = (await fromTemplate(await template(30))).body.data; await move(s.id, 'QUOTATION');
      await db.subscription.update({ where: { id: s.id }, data: { quotationValidUntil: new Date(iso(-3)) } });
      expect((await move(s.id, 'CONFIRMED')).status).toBe(409);
      const edited = await staff.put(`/api/subscriptions/${s.id}`).send(body({ startDate: iso(0), lines: [{ productId: product.id, quantity: 3 }] }));
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.data).toMatchObject({ quotationExpired: false, quotationValidityDays: 30, quotationValidUntil: addDaysIso((await import('../../src/lib/dates.js')).todayBusiness(), 30) });
      expect((await move(s.id, 'CONFIRMED')).status).toBe(200);
    });

    it('does not block a quotation that is still valid, on its last day included', async () => {
      const s = (await fromTemplate(await template(30))).body.data; await move(s.id, 'QUOTATION');
      await db.subscription.update({ where: { id: s.id }, data: { quotationValidUntil: new Date((await import('../../src/lib/dates.js')).todayBusiness()) } }); // valid through today
      expect((await move(s.id, 'CONFIRMED')).status).toBe(200);
    });
  });

  describe('list, filters and access', () => {
    it('filters by status/customer/search, paginates and caps the page size', async () => {
      const s = await createSub(); await move(s.id, 'QUOTATION');
      const byStatus = await staff.get(`/api/subscriptions?status=QUOTATION&customerId=${customerId}&pageSize=100`);
      expect(byStatus.status).toBe(200);
      expect(byStatus.body.data.every((x: { status: string; customerId: string }) => x.status === 'QUOTATION' && x.customerId === customerId)).toBe(true);
      expect(byStatus.body.data.some((x: { id: string }) => x.id === s.id)).toBe(true);
      const bySearch = await staff.get(`/api/subscriptions?search=${encodeURIComponent(s.number)}`);
      expect(bySearch.body.data.map((x: { id: string }) => x.id)).toEqual([s.id]);
      const page = await staff.get('/api/subscriptions?pageSize=2&sortBy=number&sortOrder=desc');
      expect(page.body).toMatchObject({ page: 1, pageSize: 2 }); expect(page.body.data.length).toBeLessThanOrEqual(2); expect(page.body.total).toBeGreaterThan(2);
      expect((await staff.get('/api/subscriptions?pageSize=1000')).status).toBe(422);
    });

    it('is staff/admin only for every endpoint', async () => {
      const s = await createSub();
      for (const [method, path] of [['get', '/api/subscriptions'], ['get', `/api/subscriptions/${s.id}`], ['post', `/api/subscriptions/${s.id}/transition`], ['delete', `/api/subscriptions/${s.id}`]] as const) {
        expect((await customerAgent[method](path).send({ to: 'QUOTATION' })).status, path).toBe(403);
        expect((await request(app)[method](path).send({ to: 'QUOTATION' })).status, path).toBe(401);
      }
      expect((await customerAgent.post('/api/subscriptions').send(body())).status).toBe(403);
      expect((await staff.post('/api/subscriptions').send({ ...body(), status: 'ACTIVE', number: 'HACK' })).status).toBe(422); // strict input: no forged fields
    });
  });
  describe('settlement failures and competing lifecycle actions',()=>{
    it('does not bill for invalid seat changes or forbidden transitions',async()=>{
      const s=await createSub();await activate(s.id);
      expect((await move(s.id,'PAUSED')).status).toBe(409);
      const invalid=await staff.post(`/api/subscriptions/${s.id}/change-lines`).send({lines:[{productId:product.id,quantity:1}]});
      expect(invalid.status).toBe(422);
      expect(await db.invoice.count({where:{subscriptionId:s.id}})).toBe(0);
      expect(await db.subscriptionLine.count({where:{subscriptionId:s.id}})).toBe(1);
    });
    it('keeps lifecycle state unchanged on a billing fault, then succeeds after reconciliation',async()=>{
      const s=await createSub({planId:flexPlan.id,lines:[{productId:product.id,quantity:1}]});await activate(s.id);
      await db.subscriptionLine.deleteMany({where:{subscriptionId:s.id}});
      const failed=await move(s.id,'PAUSED');
      expect(failed.status).toBe(422);expect(failed.body.error.code).toBe('INVALID_SUBSCRIPTION_LINES');
      const after=await db.subscription.findUniqueOrThrow({where:{id:s.id},include:{history:true}});
      expect(after.status).toBe('ACTIVE');expect(after.history).toHaveLength(3);
      expect(await db.invoice.count({where:{subscriptionId:s.id}})).toBe(0);
      await db.subscriptionLine.create({data:{subscriptionId:s.id,productId:product.id,description:'Reconciled service',quantity:1,unitPrice:'1000',position:0}});
      expect((await move(s.id,'PAUSED')).status).toBe(200);
      expect(await db.invoice.count({where:{subscriptionId:s.id}})).toBe(1);
    });
    it('settles competing pauses once and records only one successful pause',async()=>{
      const s=await createSub({planId:flexPlan.id,lines:[{productId:product.id,quantity:1}]});await activate(s.id);
      const rs=await Promise.all([move(s.id,'PAUSED'),move(s.id,'PAUSED')]);
      expect(rs.map(r=>r.status).sort()).toEqual([200,409]);
      expect(await db.invoice.count({where:{subscriptionId:s.id}})).toBe(1);
      expect(await db.subscriptionEvent.count({where:{subscriptionId:s.id,toStatus:'PAUSED'}})).toBe(1);
    });
  });
});
