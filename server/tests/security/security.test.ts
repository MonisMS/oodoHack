import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// A-06 security review as executable checks. Needs a disposable local PostgreSQL:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5433/brightloop_test npm test -w server
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Str0ng!Passw';
const uid = () => `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
const email = (tag: string) => `${tag}.${uid()}@example.com`;
const NIL = '00000000-0000-4000-8000-000000000999';

type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';
interface Endpoint { method: 'get' | 'post' | 'put' | 'delete'; path: string; roles: Role[] | 'public' }

// The API contract table is the source of truth for who may call what; this test fails if code and contract drift.
function contractEndpoints(): Endpoint[] {
  const text = readFileSync(fileURLToPath(new URL('../../../API_CONTRACT.md', import.meta.url)), 'utf8');
  const rows = [...text.matchAll(/^\| (GET|POST|PUT|DELETE) \| (\/api\/[^ |]+) \| ([^|]+) \|/gm)];
  return rows
    .filter(r => !r[2]!.startsWith('/api/auth/')) // Better Auth's own endpoints are covered separately below
    .map(r => ({
      method: r[1]!.toLowerCase() as Endpoint['method'], path: r[2]!.replace(/:[A-Za-z]+/g, NIL),
      roles: r[3]!.trim() === 'public' ? 'public' : (r[3]!.split(',').map(s => s.trim()) as Role[]),
    }));
}

describe.skipIf(!TEST_DB)('security review (A-06)', () => {
  let app: Express; let db: typeof import('../../src/lib/db.js').db;
  const agents = {} as Record<Role, ReturnType<typeof request.agent>>;
  const emails = {} as Record<Role, string>;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js')); ({ db } = await import('../../src/lib/db.js'));
    const { createCredentialUser } = await import('../../src/lib/auth.js');
    for (const role of ['ADMIN', 'STAFF', 'CUSTOMER'] as const) {
      emails[role] = email(`sec.${role.toLowerCase()}`);
      await createCredentialUser({ name: `Sec ${role}`, email: emails[role], password: PASSWORD, role });
      agents[role] = request.agent(app);
      expect((await agents[role].post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: emails[role], password: PASSWORD })).status).toBe(200);
    }
  });
  afterAll(async () => { await db?.$disconnect(); });

  describe('role guards on every contract endpoint', () => {
    const endpoints = contractEndpoints();
    it('parses a plausible endpoint inventory from the contract', () => {
      expect(endpoints.length).toBeGreaterThan(40);
      expect(endpoints.some(e => e.path.startsWith('/api/payments') && e.method === 'post')).toBe(true);
    });

    it('rejects anonymous callers (401) and callers of the wrong role (403); allowed roles pass the guard', async () => {
      const failures: string[] = [];
      for (const e of endpoints) {
        const label = `${e.method.toUpperCase()} ${e.path}`;
        const call = (agent: { [k in Endpoint['method']]: (p: string) => request.Test }) => agent[e.method](e.path).send({});
        if (e.roles === 'public') continue;
        const anon = await call(request(app)); if (anon.status !== 401) failures.push(`${label} anonymous -> ${anon.status}`);
        for (const role of ['ADMIN', 'STAFF', 'CUSTOMER'] as const) {
          const r = await call(agents[role]);
          const allowed = e.roles.includes(role);
          if (allowed && (r.status === 401 || r.status === 403 || r.status >= 500 && r.status !== 501)) failures.push(`${label} as ${role} (allowed) -> ${r.status}`);
          if (!allowed && r.status !== 403) failures.push(`${label} as ${role} (forbidden) -> ${r.status}`);
        }
      }
      expect(failures).toEqual([]);
    }, 120_000);
  });

  describe('Better Auth endpoints cannot be used to escalate or leak', () => {
    it('ignores attempts by a signed-in customer to change their own role or active flag', async () => {
      const agent = agents.CUSTOMER;
      for (const body of [{ role: 'ADMIN' }, { role: 'STAFF', name: 'Hax' }, { isActive: false }]) await agent.post('/api/auth/update-user').set('Origin', ORIGIN).send(body);
      const row = await db.user.findUniqueOrThrow({ where: { email: emails.CUSTOMER } });
      expect(row.role).toBe('CUSTOMER'); expect(row.isActive).toBe(true);
      expect((await agent.get('/api/users/staff')).status).toBe(403);
    });

    it('does not allow changing the login email or deleting the account through the public API', async () => {
      const agent = agents.CUSTOMER;
      const change = await agent.post('/api/auth/change-email').set('Origin', ORIGIN).send({ newEmail: email('stolen') });
      expect(change.status).toBeGreaterThanOrEqual(400);
      const del = await agent.post('/api/auth/delete-user').set('Origin', ORIGIN).send({ password: PASSWORD });
      expect(del.status).toBeGreaterThanOrEqual(400);
      expect(await db.user.count({ where: { email: emails.CUSTOMER } })).toBe(1);
    });

    it('never returns password hashes or provider secrets in auth or user responses', async () => {
      const hash = (await db.account.findFirstOrThrow({ where: { user: { email: emails.STAFF }, providerId: 'credential' } })).password as string;
      const bodies = [
        (await agents.STAFF.get('/api/auth/get-session')).text,
        (await agents.ADMIN.get('/api/users/staff?pageSize=100')).text,
        (await agents.ADMIN.get('/api/users/customers?pageSize=100')).text,
        (await request(app).post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: emails.STAFF, password: PASSWORD })).text,
        (await request(app).post('/api/auth/sign-up/email').set('Origin', ORIGIN).send({ name: 'Leak Check', email: email('leak'), password: PASSWORD })).text,
      ];
      for (const text of bodies) {
        expect(text).not.toContain(hash);
        expect(text).not.toMatch(/"(password|passwordHash|accessToken|refreshToken|idToken)"\s*:/);
      }
    });

    it('answers unknown API routes and malformed input with the generic error envelope (no stack traces)', async () => {
      const missing = await agents.ADMIN.get('/api/definitely-not-here');
      expect(missing.status).toBe(404); expect(missing.body.error.code).toBe('NOT_FOUND');
      const bad = await agents.ADMIN.post('/api/subscriptions').set('Content-Type', 'application/json').send('{"broken');
      expect(bad.status).toBe(400); expect(JSON.stringify(bad.body)).not.toMatch(/at .*\.(ts|js):\d+|node_modules|prisma/i);
    });
  });

  describe('CSRF defence for cookie sessions', () => {
    it('refuses state-changing requests from a foreign Origin even with a valid session', async () => {
      const evil = await agents.STAFF.post('/api/subscriptions').set('Origin', 'https://evil.example').send({});
      expect(evil.status).toBe(403); expect(evil.body.error.message).toMatch(/cross-origin/i);
      const mine = await agents.STAFF.post('/api/subscriptions').set('Origin', ORIGIN).send({});
      expect(mine.status).toBe(422); // reached validation, i.e. the guard let it through
      const noOrigin = await agents.STAFF.post('/api/subscriptions').send({});
      expect(noOrigin.status).toBe(422); // non-browser clients carry no Origin and are authenticated normally
    });

    it('does not apply to safe methods and sends no CORS grant to foreign origins', async () => {
      const get = await agents.STAFF.get('/api/subscriptions').set('Origin', 'https://evil.example');
      expect(get.status).toBe(200); expect(get.headers['access-control-allow-origin']).toBeUndefined();
      const preflight = await request(app).options('/api/payments').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
      const ok = await request(app).options('/api/payments').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
      expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN); expect(ok.headers['access-control-allow-credentials']).toBe('true');
    });

    it('blocks cross-origin sign-in attempts through Better Auth as well', async () => {
      const r = await request(app).post('/api/auth/sign-in/email').set('Origin', 'https://evil.example').send({ email: emails.STAFF, password: PASSWORD });
      expect(r.status).toBeGreaterThanOrEqual(400); expect(r.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('financial invariants', () => {
    it('keeps amountPaid equal to the sum of recorded payments for every invoice that has payments', async () => {
      const bad = await db.$queryRaw<Array<{ number: string }>>`
        SELECT i.number FROM "Invoice" i JOIN "Payment" p ON p."invoiceId" = i.id
        WHERE i.status <> 'CANCELLED' -- other suites insert a payment row on a cancelled invoice on purpose, to prove reopen refuses it
        GROUP BY i.id HAVING i."amountPaid" <> SUM(p.amount)
           OR (i.status = 'PAID') <> (SUM(p.amount) >= i.total)
           OR i.status NOT IN ('PAID', 'PARTIALLY_PAID')`;
      expect(bad).toEqual([]);
    });
  });
});
