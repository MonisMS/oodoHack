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
    await requireAuth({ headers: { 'x-dev-user-id': '00000000-0000-4000-8000-000000000001', 'x-dev-role': 'ADMIN' }, header: (n: string) => ({ 'x-dev-user-id': '00000000-0000-4000-8000-000000000001', 'x-dev-role': 'ADMIN' } as Record<string, string>)[n] } as never, {} as never, e => errors.push(e));
    expect((errors[0] as { status?: number })?.status).toBe(401);
  });
});
