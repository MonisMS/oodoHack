import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Needs a disposable local PostgreSQL with migrations applied:
//   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/brightloop_test npm test -w server
// Never point this at a shared or real database; tests only create uniquely named users.
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';
const GOOD = 'Str0ng!Passw';
const unique = (tag: string) => `${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;

describe.skipIf(!TEST_DB)('Better Auth integration', () => {
  let app: Express;
  let db: typeof import('../../src/lib/db.js').db;
  let createCredentialUser: typeof import('../../src/lib/auth.js').createCredentialUser;
  let resetMailer: typeof import('../../src/lib/auth.js').resetMailer;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js'));
    ({ db } = await import('../../src/lib/db.js'));
    ({ createCredentialUser, resetMailer } = await import('../../src/lib/auth.js'));
  });
  afterAll(async () => { await db?.$disconnect(); });

  type Agent = ReturnType<typeof request.agent>;
  const signUp = (agent: Agent, body: object) => agent.post('/api/auth/sign-up/email').set('Origin', ORIGIN).send(body);
  const signIn = (agent: Agent, email: string, password: string) => agent.post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email, password });

  it('signs up a CUSTOMER, starts a cookie session and authenticates API calls', async () => {
    const agent = request.agent(app); const email = unique('cust');
    const r = await signUp(agent, { name: 'Casey Customer', email, password: GOOD });
    expect(r.status).toBe(200);
    expect([r.headers['set-cookie']].flat().join(';')).toContain('better-auth.session_token');
    const row = await db.user.findUniqueOrThrow({ where: { email } });
    expect(row.role).toBe('CUSTOMER'); expect(row.isActive).toBe(true);
    // authenticated: passes requireAuth/requireRole and reaches the (still unimplemented) handler
    expect((await agent.get('/api/portal/summary')).status).toBe(200);
    // staff-only route is forbidden for a customer
    expect((await agent.get('/api/subscriptions')).status).toBe(403);
    expect((await request(app).get('/api/portal/invoices')).status).toBe(401);
  });

  it('never lets a client choose its own role or active flag', async () => {
    // Better Auth either rejects or silently ignores input:false fields; both are safe as long as nothing is escalated.
    for (const extra of [{ role: 'ADMIN' }, { role: 'STAFF' }, { isActive: false }]) {
      const email = unique('esc'); await signUp(request.agent(app), { name: 'Eve', email, password: GOOD, ...extra });
      const row = await db.user.findUnique({ where: { email } });
      if (row) { expect(row.role).toBe('CUSTOMER'); expect(row.isActive).toBe(true); }
    }
  });

  it('enforces the full password policy on signup', async () => {
    for (const bad of ['Abcdef!1', 'abcdefgh!1', 'ABCDEFGH!1', 'Abcdefghi1', 'Abcdefgh 1']) {
      const r = await signUp(request.agent(app), { name: 'Weak', email: unique('weak'), password: bad });
      expect(r.status, bad).toBe(400);
    }
  });

  it('rejects duplicate emails regardless of case', async () => {
    const email = unique('dup'); expect((await signUp(request.agent(app), { name: 'One', email, password: GOOD })).status).toBe(200);
    expect((await signUp(request.agent(app), { name: 'Two', email: email.toUpperCase(), password: GOOD })).status).toBeGreaterThanOrEqual(400);
  });

  it('rejects wrong credentials and works for right ones, case-insensitively on email', async () => {
    const email = unique('login'); await signUp(request.agent(app), { name: 'Log In', email, password: GOOD });
    expect((await signIn(request.agent(app), email, 'Wr0ng!Passw')).status).toBe(401);
    expect((await signIn(request.agent(app), email.toUpperCase(), GOOD)).status).toBe(200);
  });

  it('creates staff only through the server helper and enforces role guards', async () => {
    const email = unique('staff'); await createCredentialUser({ name: 'Sam Staff', email, password: GOOD, role: 'STAFF' });
    const agent = request.agent(app); expect((await signIn(agent, email, GOOD)).status).toBe(200);
    expect((await agent.get('/api/subscriptions')).status).toBe(200); // staff allowed
    expect((await agent.post('/api/products').send({})).status).toBe(403); // admin-only
    await expect(createCredentialUser({ name: 'Bad', email: unique('bad'), password: 'weak', role: 'STAFF' })).rejects.toThrow();
  });

  it('createCredentialUser can create a user with a fixed id that signs in like a real account', async () => {
    const fixedId = crypto.randomUUID(); const email = unique('fixed');
    const user = await createCredentialUser({ id: fixedId, name: 'Fixed Id', email, password: GOOD, role: 'CUSTOMER' });
    expect(user.id).toBe(fixedId);
    const agent = request.agent(app); expect((await signIn(agent, email, GOOD)).status).toBe(200);
    expect((await agent.get('/api/auth/get-session')).body.user.id).toBe(fixedId);
    // atomic: a duplicate email must not leave a half-created account behind
    await expect(createCredentialUser({ name: 'Dup', email, password: GOOD, role: 'STAFF' })).rejects.toThrow();
    expect(await db.account.count({ where: { userId: fixedId } })).toBe(1);
  });

  it('blocks deactivated users from signing in and from using an existing session', async () => {
    const email = unique('inactive'); const agent = request.agent(app);
    await signUp(agent, { name: 'Ina Ctive', email, password: GOOD });
    expect((await agent.get('/api/portal/summary')).status).toBe(200);
    await db.user.update({ where: { email }, data: { isActive: false } });
    expect((await agent.get('/api/portal/invoices')).status).toBe(401);
    expect((await signIn(request.agent(app), email, GOOD)).status).toBeGreaterThanOrEqual(400);
  });

  it('signs out and invalidates the session', async () => {
    const agent = request.agent(app); await signUp(agent, { name: 'Out', email: unique('out'), password: GOOD });
    expect((await agent.post('/api/auth/sign-out').set('Origin', ORIGIN).send({})).status).toBe(200);
    expect((await agent.get('/api/portal/invoices')).status).toBe(401);
  });

  it('password reset: neutral response, one-time token, policy enforced, old sessions revoked', async () => {
    const email = unique('reset'); const old = request.agent(app);
    await signUp(old, { name: 'Re Set', email, password: GOOD });
    const sent = vi.spyOn(resetMailer, 'send').mockResolvedValue();
    const ask = (e: string) => request(app).post('/api/auth/request-password-reset').set('Origin', ORIGIN).send({ email: e, redirectTo: `${ORIGIN}/reset-password` });
    const known = await ask(email); const unknown = await ask(unique('nobody'));
    expect(known.status).toBe(200); expect(unknown.status).toBe(known.status); expect(unknown.body).toEqual(known.body);
    await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1));
    expect(sent.mock.calls[0]![0].to).toBe(email);
    const token = new URL(sent.mock.calls[0]![0].url).pathname.split('/').pop()!;
    const reset = (t: string, p: string) => request(app).post('/api/auth/reset-password').set('Origin', ORIGIN).send({ token: t, newPassword: p });
    expect((await reset(token, 'weakpass')).status).toBe(400); // policy still applies
    expect((await reset(token, 'N3w!Passwordx')).status).toBe(200);
    expect((await reset(token, 'An0ther!Passw')).status).toBeGreaterThanOrEqual(400); // one-time
    expect((await signIn(request.agent(app), email, GOOD)).status).toBe(401);
    expect((await signIn(request.agent(app), email, 'N3w!Passwordx')).status).toBe(200);
    expect((await old.get('/api/portal/invoices')).status).toBe(401); // previous session revoked
    sent.mockRestore();
  });

  it('rejects an expired reset token', async () => {
    const email = unique('expire'); await signUp(request.agent(app), { name: 'Ex Pire', email, password: GOOD });
    const sent = vi.spyOn(resetMailer, 'send').mockResolvedValue();
    await request(app).post('/api/auth/request-password-reset').set('Origin', ORIGIN).send({ email, redirectTo: `${ORIGIN}/reset-password` });
    await vi.waitFor(() => expect(sent).toHaveBeenCalled());
    const token = new URL(sent.mock.calls[0]![0].url).pathname.split('/').pop()!;
    await db.verification.updateMany({ where: { identifier: { contains: token } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await request(app).post('/api/auth/reset-password').set('Origin', ORIGIN).send({ token, newPassword: 'N3w!Passwordx' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    sent.mockRestore();
  });

  describe('users module (staff + customers)', () => {
    let admin: Agent; let staff: Agent; let customer: Agent; const staffEmail = unique('newstaff');
    beforeAll(async () => {
      const adminEmail = unique('admin'); await createCredentialUser({ name: 'Ada Admin', email: adminEmail, password: GOOD, role: 'ADMIN' });
      admin = request.agent(app); await signIn(admin, adminEmail, GOOD);
      const s = unique('st'); await createCredentialUser({ name: 'Stan Staff', email: s, password: GOOD, role: 'STAFF' });
      staff = request.agent(app); await signIn(staff, s, GOOD);
      customer = request.agent(app); await signUp(customer, { name: 'Cy Customer', email: unique('cy'), password: GOOD });
    });

    it('ADMIN creates STAFF who can then sign in; the response never leaks credentials', async () => {
      const r = await admin.post('/api/users/staff').send({ name: 'New Staff', email: staffEmail.toUpperCase(), password: GOOD });
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ name: 'New Staff', email: staffEmail, role: 'STAFF', isActive: true });
      expect(JSON.stringify(r.body)).not.toMatch(/password|hash|token/i);
      expect((await signIn(request.agent(app), staffEmail, GOOD)).status).toBe(200);
    });

    it('rejects duplicate staff email (409) and weak passwords (422)', async () => {
      expect((await admin.post('/api/users/staff').send({ name: 'Dup', email: staffEmail, password: GOOD })).status).toBe(409);
      const weak = await admin.post('/api/users/staff').send({ name: 'Weak', email: unique('weakstaff'), password: 'weakpass' });
      expect(weak.status).toBe(422); expect(weak.body.error.fields.password).toBeDefined();
    });

    it('only ADMIN may create or list staff', async () => {
      const body = { name: 'X', email: unique('x'), password: GOOD };
      expect((await staff.post('/api/users/staff').send(body)).status).toBe(403);
      expect((await customer.post('/api/users/staff').send(body)).status).toBe(403);
      expect((await request(app).post('/api/users/staff').send(body)).status).toBe(401);
      expect((await staff.get('/api/users/staff')).status).toBe(403);
      const list = await admin.get('/api/users/staff?search=newstaff');
      expect(list.status).toBe(200); expect(list.body.data.map((u: { email: string }) => u.email)).toContain(staffEmail);
    });

    it('ADMIN and STAFF list customers with pagination; customers cannot', async () => {
      const r = await staff.get('/api/users/customers?pageSize=1');
      expect(r.status).toBe(200); expect(r.body).toMatchObject({ page: 1, pageSize: 1 });
      expect(r.body.data.length).toBeLessThanOrEqual(1); expect(r.body.total).toBeGreaterThan(0);
      expect(r.body.data.every((u: { role: string }) => u.role === 'CUSTOMER')).toBe(true);
      expect((await admin.get('/api/users/customers?search=cy.')).status).toBe(200);
      expect((await customer.get('/api/users/customers')).status).toBe(403);
      expect((await admin.get('/api/users/customers?pageSize=1000')).status).toBe(422);
    });
  });
});
