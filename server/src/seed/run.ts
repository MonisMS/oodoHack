import type { Prisma, PrismaClient } from '@prisma/client';
import { addDays, todayBusiness } from '../lib/dates.js';
import { env } from '../lib/env.js';
import { createBillingService } from '../modules/billing-engine/service.js';
import { seedCatalog, seedUsers } from './catalog.js';
import { DEMO_MARKER, finishDemoSubscriptions, seedDemoSubscriptions } from './demo.js';
import { finishPerf, PERF_PREFIX, seedPerfCustomers, seedPerfSubscriptions } from './perf.js';
import { assertDisposableDatabase, assertSeedAllowed } from './support.js';

export interface SeedOptions { perf?: boolean; subscriptions?: number; customers?: number; log?: (message: string) => void; databaseUrl?: string }
export interface SeedSummary { usersCreated: number; demoSubscriptionsCreated: number; perfCustomersCreated: number; perfSubscriptionsCreated: number; invoicesCreated: number; autoClosed: number; confirmed: number; payments: number }

const SEED_ONLY: Prisma.SubscriptionWhereInput = { OR: [{ notes: { startsWith: DEMO_MARKER } }, { notes: 'seed:perf' }, { number: { startsWith: PERF_PREFIX } }] };

/**
 * Bills the seeded subscriptions the way the business would have: the billing engine is run week by week from the oldest start
 * date to today, so invoices get realistic issue/due dates and every amount comes from the real calculator. Subscriptions that
 * are not part of the seed are excluded, so seeding a database that already holds other data never invoices that data.
 */
async function billSeedHistory(db: PrismaClient, today: string, log: (m: string) => void) {
  const earliest = (await db.subscription.aggregate({ where: { ...SEED_ONLY, status: 'ACTIVE' }, _min: { startDate: true } }))._min.startDate;
  if (!earliest) return { created: 0, autoClosed: 0 };
  // Null-safe on purpose: `NOT (notes LIKE ...)` is NULL (so the row would be skipped) when notes IS NULL, which would let
  // the seed bill an unrelated subscription. COALESCE keeps every non-seed row in the exclusion list.
  const others = (await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Subscription"
    WHERE NOT (COALESCE(notes, '') LIKE ${DEMO_MARKER + '%'} OR COALESCE(notes, '') = 'seed:perf' OR number LIKE ${PERF_PREFIX + '%'})`).map(row => row.id);
  if (others.length > 10_000) throw new Error('Too many non-seed subscriptions to exclude from seed billing; run the seed on a clean database');
  const service = createBillingService(db, { maxSubscriptionsPerRun: 1000, maxRunDurationMs: 300_000 });
  const first = earliest.toISOString().slice(0, 10);
  const totals = { created: 0, autoClosed: 0 };
  const dates: string[] = [];
  for (let d = first; d < today; d = addDays(d, 7)) dates.push(d);
  dates.push(today);
  for (const asOfDate of dates) {
    let more = true;
    while (more) {
      const run = await service.runBilling({ asOfDate, maxPeriodsPerSubscription: 24 }, { excludeSubscriptionIds: others });
      if (run.failures.length) throw new Error(`Seed billing failed for ${run.failures.length} subscription(s): ${run.failures[0]!.code} ${run.failures[0]!.message}`);
      totals.created += run.created; totals.autoClosed += run.autoClosed; more = run.hasMore;
    }
    log(`billed as of ${asOfDate}: ${totals.created} invoices so far`);
  }
  return totals;
}

/**
 * Idempotent demo/performance data. Never truncates anything, refuses to run in production, and only the --perf volume set is
 * restricted to a disposable local database. Running it twice changes nothing the second time.
 */
export async function runSeed(db: PrismaClient, options: SeedOptions = {}): Promise<SeedSummary> {
  const log = options.log ?? (() => {});
  assertSeedAllowed(env.NODE_ENV);
  if (options.perf) assertDisposableDatabase(options.databaseUrl ?? process.env.DATABASE_URL);
  const today = todayBusiness();
  const summary: SeedSummary = { usersCreated: 0, demoSubscriptionsCreated: 0, perfCustomersCreated: 0, perfSubscriptionsCreated: 0, invoicesCreated: 0, autoClosed: 0, confirmed: 0, payments: 0 };

  summary.usersCreated = await seedUsers(db); log(`users: ${summary.usersCreated} created`);
  const catalog = await seedCatalog(db, today); log('catalog: taxes, products, plans, discounts, templates ready');
  summary.demoSubscriptionsCreated = await seedDemoSubscriptions(db, catalog, today); log(`demo subscriptions: ${summary.demoSubscriptionsCreated} created`);
  if (options.perf) {
    const customers = await seedPerfCustomers(db, options.customers ?? 300); summary.perfCustomersCreated = customers.created; log(`perf customers: ${customers.created} created`);
    summary.perfSubscriptionsCreated = await seedPerfSubscriptions(db, catalog, customers.ids, options.subscriptions ?? 5000, today); log(`perf subscriptions: ${summary.perfSubscriptionsCreated} created`);
  }

  const billed = await billSeedHistory(db, today, log); summary.invoicesCreated = billed.created; summary.autoClosed = billed.autoClosed;
  const demo = await finishDemoSubscriptions(db, today); summary.confirmed += demo.confirmed; summary.payments += demo.payments; log(`demo invoices: ${demo.confirmed} confirmed, ${demo.payments} payments`);
  if (options.perf) { const perf = await finishPerf(db, today); summary.payments += perf.payments; log(`perf: ${perf.flipped} subscriptions paused/closed, ${perf.payments} payments`); }
  return summary;
}
