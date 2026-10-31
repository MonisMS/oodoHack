import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { password, date, discountInput, planInput } from '../src/lib/contracts.js';
let app: Express;
const devHeaders = { 'x-dev-user-id': '00000000-0000-4000-8000-000000000001', 'x-dev-role': 'STAFF' };
beforeAll(async () => { process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'true'; ({ app } = await import('../src/app.js')); });
describe('foundation boundaries', () => {
  it('boots without a database and returns the standard health envelope', async () => { const r = await request(app).get('/api/health'); expect(r.status).toBe(200); expect(r.body.data.status).toBe('ok'); });
  it('rejects missing development identity', async () => { const r = await request(app).get('/api/subscriptions'); expect(r.status).toBe(401); expect(r.body.error.code).toBe('UNAUTHENTICATED'); });
  it('enforces admin-only mutations before controllers run', async () => { const r = await request(app).post('/api/products').set(devHeaders).send({}); expect(r.status).toBe(403); });
  it('registers the billing route but reports unfinished business logic honestly', async () => { const r = await request(app).post('/api/billing/run').set(devHeaders).send({ asOfDate: '2026-10-31' }); expect(r.status).toBe(501); expect(r.body.error.code).toBe('NOT_IMPLEMENTED'); });
  it('caps pagination and provides field errors', async () => { const r = await request(app).get('/api/subscriptions?pageSize=10000').set(devHeaders); expect(r.status).toBe(422); expect(r.body.error.fields.pageSize).toBeDefined(); });
  it('validates UUID params and blocks forged customer filters in the portal', async () => { expect((await request(app).get('/api/subscriptions/not-a-uuid').set(devHeaders)).status).toBe(422); const r = await request(app).get('/api/portal/invoices?customerId=00000000-0000-4000-8000-000000000002').set({ ...devHeaders, 'x-dev-role': 'CUSTOMER' }); expect(r.status).toBe(422); });
  it('handles malformed JSON with the shared error format', async () => { const r = await request(app).post('/api/products').set(devHeaders).set('Content-Type','application/json').send('{'); expect(r.status).toBe(400); expect(r.body.error.code).toBe('INVALID_JSON'); });
  it('uses uniform not-found errors', async () => { const r = await request(app).get('/api/missing'); expect(r.status).toBe(404); expect(r.body.error.code).toBe('NOT_FOUND'); });
});
describe('frozen input contracts', () => {
  it('requires the full password policy including bcrypt byte length', () => { expect(password.safeParse('Abcdefgh!').success).toBe(true); for (const invalid of ['Abcdefg!', 'abcdefgh!', 'ABCDEFGH!', 'Abcdefghi', 'Ab!'+ 'é'.repeat(36)]) expect(password.safeParse(invalid).success).toBe(false); });
  it('rejects impossible calendar dates', () => { expect(date.safeParse('2024-02-29').success).toBe(true); expect(date.safeParse('2025-02-29').success).toBe(false); });
  it('rejects equal availability bounds', () => { expect(planInput.safeParse({ name:'Plan',price:'10.00',billingPeriod:'MONTHLY',minQuantity:1,availableFrom:'2026-01-01',availableTo:'2026-01-01',autoClose:true,closableEarly:false,pausable:false,renewable:false }).success).toBe(false); });
  it('rejects percentage over 100 and writable usage counters', () => { const input = { name:'Promo',type:'PERCENTAGE',scope:'SUBSCRIPTION',value:'100.01',startsAt:'2026-01-01' }; expect(discountInput.safeParse(input).success).toBe(false); expect(discountInput.safeParse({ ...input,value:'10.00',usedCount:1 }).success).toBe(false); });
});
