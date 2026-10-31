import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Rate limiting is off in the other test files; this file turns it on (it needs the database for the auth lookups).
const TEST_DB = process.env.TEST_DATABASE_URL;
const ORIGIN = 'http://localhost:5173';

describe.skipIf(!TEST_DB)('auth rate limiting (A-06)', () => {
  let app: Express; let db: typeof import('../../src/lib/db.js').db;
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB; process.env.NODE_ENV = 'test'; process.env.AUTH_RATE_LIMIT = 'true'; process.env.DEV_AUTH_ENABLED = 'false';
    ({ app } = await import('../../src/app.js')); ({ db } = await import('../../src/lib/db.js'));
  });
  afterAll(async () => { delete process.env.AUTH_RATE_LIMIT; await db?.$disconnect(); });

  it('throttles repeated password-reset requests (limit 3 per minute) with HTTP 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(app).post('/api/auth/request-password-reset').set('Origin', ORIGIN).send({ email: `nobody.${i}@example.com`, redirectTo: `${ORIGIN}/reset-password` })).status);
    expect(statuses.slice(0, 3).every(s => s === 200)).toBe(true);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });

  it('throttles credential guessing on sign-in (limit 8 per minute) with HTTP 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push((await request(app).post('/api/auth/sign-in/email').set('Origin', ORIGIN).send({ email: 'ghost@example.com', password: 'Wr0ng!Passw' })).status);
    expect(statuses.slice(0, 8).every(s => s === 401)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
  });

  it('does not throttle ordinary API calls', async () => {
    for (let i = 0; i < 15; i++) expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

describe('allowed browser origins', () => {
  it('treats localhost and 127.0.0.1 as equivalent in development but only CLIENT_ORIGIN in production', async () => {
    vi.resetModules(); vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('CLIENT_ORIGIN', 'http://localhost:5173');
    expect((await import('../../src/lib/env.js')).allowedOrigins.sort()).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
    vi.resetModules(); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DEV_AUTH_ENABLED', 'false'); vi.stubEnv('BETTER_AUTH_SECRET', 'p'.repeat(40)); vi.stubEnv('CLIENT_ORIGIN', 'https://app.example.com');
    expect((await import('../../src/lib/env.js')).allowedOrigins).toEqual(['https://app.example.com']);
    vi.unstubAllEnvs(); vi.resetModules();
  });
});
