import { createHash } from 'node:crypto';

// Deterministic identifiers so every seed run produces the same rows (that is what makes the seed idempotent).
export function stableUuid(namespace: string, key: string | number): string {
  const h = createHash('sha1').update(`brightloop-seed:${namespace}:${key}`).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

/** Small deterministic PRNG (mulberry32): the same seed always yields the same "random" data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)), pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T };
}

/** Seeding never runs against production, and the big performance set only against a disposable local database. */
export function assertSeedAllowed(nodeEnv: string) {
  if (nodeEnv === 'production') throw new Error('Refusing to seed demo data when NODE_ENV=production');
}
export function assertDisposableDatabase(databaseUrl: string | undefined) {
  let url: URL;
  try { url = new URL(databaseUrl ?? ''); } catch { throw new Error('DATABASE_URL is not a valid URL'); }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (!local || !/(test|demo|perf|seed)/i.test(name)) throw new Error(`The --perf seed only runs on a disposable local database (host localhost/127.0.0.1 and a name containing test, demo, perf or seed); got host "${url.hostname}" database "${name}"`);
}
