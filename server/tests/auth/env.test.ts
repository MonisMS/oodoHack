import { afterEach, describe, expect, it, vi } from 'vitest';

// Production safety: the dev identity header fallback and the default secret must be impossible to ship.
describe('production environment guards', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('refuses to start with DEV_AUTH_ENABLED in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DEV_AUTH_ENABLED', 'true'); vi.stubEnv('BETTER_AUTH_SECRET', 'x'.repeat(40));
    vi.resetModules();
    await expect(import('../../src/lib/env.js')).rejects.toThrow(/DEV_AUTH_ENABLED/);
  });

  it('refuses the built-in development secret in production', async () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DEV_AUTH_ENABLED', 'false'); vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.resetModules();
    await expect(import('../../src/lib/env.js')).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it('ignores x-dev-* headers when the dev adapter is off', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'false'); vi.resetModules();
    const { requireAuth } = await import('../../src/middleware/auth.js');
    const errors: unknown[] = [];
    await requireAuth({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-dev-user-id': '00000000-0000-4000-8000-000000000001', 'x-dev-role': 'ADMIN' }, header: (n: string) => ({ 'x-dev-user-id': '00000000-0000-4000-8000-000000000001', 'x-dev-role': 'ADMIN' } as Record<string, string>)[n] } as never, {} as never, e => errors.push(e));
    expect((errors[0] as { status?: number })?.status).toBe(401);
  });

  it('accepts the dev identity only from this machine, even when the adapter is on', async () => {
    vi.stubEnv('DEV_AUTH_ENABLED', 'true'); vi.resetModules();
    const { requireAuth } = await import('../../src/middleware/auth.js');
    const headers = { 'x-dev-user-id': '00000000-0000-4000-8000-000000000001', 'x-dev-role': 'ADMIN' } as Record<string, string>;
    const run = async (remoteAddress: string) => { const req = { socket: { remoteAddress }, headers, header: (n: string) => headers[n] } as never; const outcome: { error?: unknown; user?: unknown } = {}; await requireAuth(req, {} as never, e => { outcome.error = e; }); outcome.user = (req as { user?: unknown }).user; return outcome; };
    expect(((await run('203.0.113.5')).error as { status?: number }).status).toBe(401); // another machine
    expect(((await run('::ffff:10.0.0.7')).error as { status?: number }).status).toBe(401);
    expect((await run('127.0.0.1')).user).toMatchObject({ role: 'ADMIN' }); // this machine
    expect((await run('::1')).user).toMatchObject({ role: 'ADMIN' });
  });

  it('binds to loopback by default and keeps proxy headers untrusted by default', async () => {
    vi.resetModules(); const { env } = await import('../../src/lib/env.js');
    expect(env.HOST).toBe('127.0.0.1'); expect(env.TRUST_PROXY).toBe(false); expect(env.BUSINESS_TZ).toBe('Asia/Kolkata');
  });
});

