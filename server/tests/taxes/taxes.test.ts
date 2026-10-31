import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Tax administration (D-02). Needs a disposable local PostgreSQL:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/brightloop_test npm test -w server
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const PW = 'Str0ng!Passw';
const uid = () => `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!TEST_DB)('taxes (D-02)', () => {
  let app: Express; let db: typeof import('../../src/lib/db.js').db;
  const A = {} as Record<'admin' | 'staff' | 'customer', ReturnType<typeof request.agent>>;
  let product: { id: string }; let plan: { id: string };
  const name = (t = 'GST') => `${t} ${uid()}`;
  const input = (over: Record<string, unknown> = {}) => ({ name: name(), percentage: '18', isActive: true, productIds: [], planIds: [], ...over });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js')); ({ db } = await import('../../src/lib/db.js'));
    const { createCredentialUser } = await import('../../src/lib/auth.js');
    for (const role of ['admin', 'staff', 'customer'] as const) {
      const e = `tax.${role}.${uid()}@example.com`; await createCredentialUser({ name: `Tax ${role}`, email: e, password: PW, role: role.toUpperCase() as 'ADMIN' });
      A[role] = request.agent(app); expect((await A[role].post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: e, password: PW })).status).toBe(200);
    }
    product = await db.product.create({ data: { name: `TaxProd ${uid()}`, salesPrice: '10.00', costPrice: '1.00' } });
    plan = await db.plan.create({ data: { name: `TaxPlan ${uid()}`, price: '5.00', billingPeriod: 'MONTHLY', minQuantity: 1, autoClose: true, closableEarly: false, pausable: false, renewable: false } });
  });
  afterAll(async () => { await db?.$disconnect(); });

  it('creates, reads, edits and lists a tax with plain decimal percentages', async () => {
    const created = await A.admin.post('/api/taxes').send(input({ name: name('GST18'), percentage: '18.0000' }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data).toMatchObject({ percentage: '18', isActive: true, productIds: [], planIds: [] });
    const id = created.body.data.id;
    expect((await A.staff.get(`/api/taxes/${id}`)).body.data.id).toBe(id); // staff may read
    const edited = await A.admin.put(`/api/taxes/${id}`).send(input({ name: 'Renamed ' + uid(), percentage: '12.5' }));
    expect(edited.status).toBe(200); expect(edited.body.data.percentage).toBe('12.5');
    const list = await A.staff.get('/api/taxes?search=Renamed&pageSize=5&sortBy=name');
    expect(list.status).toBe(200); expect(list.body.data.some((t: { id: string }) => t.id === id)).toBe(true);
  });

  it('links taxes to products and plans, replaces the links, and rejects unknown ones', async () => {
    const t = (await A.admin.post('/api/taxes').send(input({ productIds: [product.id], planIds: [plan.id] }))).body.data;
    expect(t).toMatchObject({ productIds: [product.id], planIds: [plan.id] });
    const cleared = await A.admin.put(`/api/taxes/${t.id}`).send(input({ name: t.name, productIds: [], planIds: [plan.id] }));
    expect(cleared.body.data).toMatchObject({ productIds: [], planIds: [plan.id] });
    const bad = await A.admin.post('/api/taxes').send(input({ productIds: [crypto.randomUUID()], planIds: [crypto.randomUUID()] }));
    expect(bad.status).toBe(422); expect(Object.keys(bad.body.error.fields).sort()).toEqual(['planIds', 'productIds']);
    expect(await db.tax.count({ where: { name: bad.body?.name ?? '' } })).toBe(0);
  });

  it('validates percentage, name and unique names', async () => {
    for (const percentage of ['100.01', '-1', '18.12345', 'abc', '', '1e2']) expect([percentage, (await A.admin.post('/api/taxes').send(input({ percentage }))).status]).toEqual([percentage, 422]);
    expect((await A.admin.post('/api/taxes').send(input({ name: '' }))).status).toBe(422);
    expect((await A.admin.post('/api/taxes').send(input({ name: 'x'.repeat(101) }))).status).toBe(422);
    expect((await A.admin.post('/api/taxes').send(input({ name: 'a\u0000b' }))).status).toBe(422);
    expect((await A.admin.post('/api/taxes').send({ ...input(), isSystem: true })).status).toBe(422); // strict input
    for (const percentage of ['0', '100', '0.0001']) expect([percentage, (await A.admin.post('/api/taxes').send(input({ percentage }))).status]).toEqual([percentage, 201]);
    const dup = name('Dup'); await A.admin.post('/api/taxes').send(input({ name: dup }));
    const again = await A.admin.post('/api/taxes').send(input({ name: dup }));
    expect(again.status).toBe(409); expect(again.body.error.fields.name[0]).toMatch(/already exists/);
    const other = (await A.admin.post('/api/taxes').send(input())).body.data;
    expect((await A.admin.put(`/api/taxes/${other.id}`).send(input({ name: dup }))).status).toBe(409); // rename onto an existing name
  });

  it('DELETE deactivates and keeps the record; missing ids are 404', async () => {
    const t = (await A.admin.post('/api/taxes').send(input({ productIds: [product.id] }))).body.data;
    expect((await A.admin.delete(`/api/taxes/${t.id}`)).status).toBe(204);
    expect((await A.admin.get(`/api/taxes/${t.id}`)).body.data).toMatchObject({ isActive: false, productIds: [product.id] });
    expect((await A.admin.delete(`/api/taxes/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await A.admin.get(`/api/taxes/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await A.admin.put(`/api/taxes/${crypto.randomUUID()}`).send(input())).status).toBe(404);
  });

  it('only admins change taxes; staff read; customers and anonymous are refused', async () => {
    const t = (await A.admin.post('/api/taxes').send(input())).body.data;
    for (const [agent, label] of [[A.staff, 'staff'], [A.customer, 'customer']] as const) {
      expect([label, (await agent.post('/api/taxes').send(input())).status]).toEqual([label, 403]);
      expect([label, (await agent.put(`/api/taxes/${t.id}`).send(input())).status]).toEqual([label, 403]);
      expect([label, (await agent.delete(`/api/taxes/${t.id}`)).status]).toEqual([label, 403]);
    }
    expect((await A.customer.get('/api/taxes')).status).toBe(403);
    expect((await request(app).get('/api/taxes')).status).toBe(401);
    expect((await A.staff.get('/api/taxes?pageSize=1000')).status).toBe(422);
  });
});
