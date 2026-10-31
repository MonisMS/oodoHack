import { Prisma, type PrismaClient } from '@prisma/client';
import { addDays, parseDate } from '../lib/dates.js';
import { FIXTURE_IDS } from '../lib/fixtures.js';
import type { SeedCatalog } from './catalog.js';
import { rng, stableUuid } from './support.js';

// Opt-in volume data for the "pages respond in under 2 seconds with thousands of subscriptions" requirement.
// Subscriptions are inserted in bulk; their INVOICES still come from the billing engine (see run.ts), so no invoice maths is
// invented here. Only the commercial outcome (paid / partial / open, paused / closed) is applied afterwards, with SQL that
// preserves the invariants (amountPaid = sum of payments, PAID only when fully paid).
export const PERF_PREFIX = 'SUB/SEED/PERF/';
const ADMIN_ID = FIXTURE_IDS.users.admin;
const PLAN_MIX = [0, 0, 0, 0, 1, 1, 2, 2, 3, 4, 4, 5] as const; // index into the catalog plans: monthly-heavy like a real book

export async function seedPerfCustomers(db: PrismaClient, total: number): Promise<{ ids: string[]; created: number }> {
  const fixtures = [FIXTURE_IDS.users.customerAcme, FIXTURE_IDS.users.customerNorthwind, FIXTURE_IDS.users.customerGlobex];
  const extra = Math.max(0, total - fixtures.length);
  const rows = Array.from({ length: extra }, (_, i) => ({ id: stableUuid('perf-customer', i + 1), email: `customer${String(i + 1).padStart(4, '0')}@seed.example`, name: `Seed Customer ${i + 1}`, role: 'CUSTOMER' as const, emailVerified: true }));
  let created = 0;
  for (let i = 0; i < rows.length; i += 500) created += (await db.user.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true })).count;
  return { ids: [...fixtures, ...rows.map(r => r.id)], created };
}

export async function seedPerfSubscriptions(db: PrismaClient, catalog: SeedCatalog, customerIds: string[], count: number, today: string): Promise<number> {
  const subs: Prisma.SubscriptionCreateManyInput[] = []; const lines: Prisma.SubscriptionLineCreateManyInput[] = [];
  for (let i = 1; i <= count; i += 1) {
    const r = rng(i * 7919); const plan = catalog.plans[r.pick(PLAN_MIX)]!;
    const quote = r.next() < 0.04;
    // Daily/weekly plans bill many periods, so they start more recently to keep the run time sensible.
    const age = plan.period === 'DAILY' ? r.int(3, 20) : plan.period === 'WEEKLY' ? r.int(5, 60) : r.int(5, 110);
    const startDate = quote ? addDays(today, r.int(1, 30)) : addDays(today, -age);
    const start = parseDate(startDate);
    const id = stableUuid('perf-sub', i);
    subs.push({ id, number: `${PERF_PREFIX}${String(i).padStart(5, '0')}`, customerId: customerIds[(i * 7) % customerIds.length]!, planId: plan.id, status: quote ? 'QUOTATION' : 'ACTIVE', startDate: start, nextInvoiceDate: start, billingAnchorDay: start.getUTCDate(), billingAnchorMonth: start.getUTCMonth() + 1, paymentTermsDays: r.pick([0, 15, 30, 30, 45]), planPrice: plan.price, notes: 'seed:perf' });
    const productCount = r.int(1, 3); const chosen = new Set<number>(); while (chosen.size < productCount) chosen.add(r.int(0, catalog.products.length - 1));
    [...chosen].forEach((productIndex, position) => {
      const product = catalog.products[productIndex]!; const variant = product.variants.length && r.next() < 0.7 ? r.pick(product.variants) : null;
      const quantity = position === 0 ? Math.max(plan.minQuantity, r.int(1, 12)) : r.int(1, 6);
      lines.push({ id: stableUuid('perf-line', `${i}:${position}`), subscriptionId: id, productId: product.id, variantId: variant?.id ?? null, description: variant ? `${product.name}` : product.name, quantity, unitPrice: new Prisma.Decimal(product.price).plus(variant?.extra ?? 0).toFixed(2), position });
    });
  }
  let created = 0;
  for (let i = 0; i < subs.length; i += 500) created += (await db.subscription.createMany({ data: subs.slice(i, i + 500), skipDuplicates: true })).count;
  for (let i = 0; i < lines.length; i += 1000) await db.subscriptionLine.createMany({ data: lines.slice(i, i + 1000), skipDuplicates: true });
  return created;
}

/** After billing: some active subscriptions end up paused or closed, and invoices end up paid / partly paid / open. Deterministic and repeatable. */
export async function finishPerf(db: PrismaClient, today: string): Promise<{ flipped: number; payments: number }> {
  const flipped = await db.$executeRaw`
    WITH pick AS (
      SELECT s.id, s."nextInvoiceDate",
        CASE WHEN abs(hashtext(s.id::text || 'state')) % 100 < 5 THEN 'PAUSED' WHEN abs(hashtext(s.id::text || 'state')) % 100 < 13 THEN 'CLOSED' END AS kind
      FROM "Subscription" s
      WHERE s.number LIKE ${PERF_PREFIX + '%'} AND s.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM "Invoice" i WHERE i."subscriptionId" = s.id)
    ), upd AS (
      UPDATE "Subscription" s SET status = pick.kind::"SubscriptionStatus",
        "expiryDate" = CASE WHEN pick.kind = 'CLOSED' THEN pick."nextInvoiceDate" - 1 ELSE s."expiryDate" END
      FROM pick WHERE s.id = pick.id AND pick.kind IS NOT NULL RETURNING s.id, pick.kind
    )
    INSERT INTO "SubscriptionEvent"(id, "subscriptionId", "fromStatus", "toStatus", "actorId", reason, "createdAt")
    SELECT gen_random_uuid(), id, 'ACTIVE'::"SubscriptionStatus", kind::"SubscriptionStatus", ${ADMIN_ID}::uuid, 'Seeded performance data', now() FROM upd`;

  // Billing leaves DRAFT invoices. Zero-total ones settle on confirmation, the rest become CONFIRMED.
  await db.$executeRaw`UPDATE "Invoice" i SET status = 'PAID' FROM "Subscription" s WHERE s.id = i."subscriptionId" AND s.number LIKE ${PERF_PREFIX + '%'} AND i.status = 'DRAFT' AND i.total = 0`;
  await db.$executeRaw`UPDATE "Invoice" i SET status = 'CONFIRMED' FROM "Subscription" s WHERE s.id = i."subscriptionId" AND s.number LIKE ${PERF_PREFIX + '%'} AND i.status = 'DRAFT'`;

  const payments = await db.$executeRaw`
    WITH pick AS (
      SELECT i.id, i.total, i."issueDate",
        abs(hashtext(i.id::text)) % 100 AS bucket,
        CASE WHEN i."issueDate" < ${today}::date - 30 THEN 70 ELSE 35 END AS paid_pct
      FROM "Invoice" i JOIN "Subscription" s ON s.id = i."subscriptionId"
      WHERE s.number LIKE ${PERF_PREFIX + '%'} AND i.status = 'CONFIRMED' AND i.total > 0 AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."invoiceId" = i.id)
    ), chosen AS (
      SELECT id, total, "issueDate", CASE WHEN bucket < paid_pct THEN 'FULL' WHEN bucket < paid_pct + 12 THEN 'PART' END AS kind FROM pick
    ), ins AS (
      INSERT INTO "Payment"(id, "invoiceId", "recordedById", method, amount, date, "createdAt")
      SELECT gen_random_uuid(), id, ${ADMIN_ID}::uuid, (ARRAY['CASH','BANK_TRANSFER','UPI','CARD'])[1 + abs(hashtext(id::text || 'm')) % 4]::"PaymentMethod",
             CASE kind WHEN 'FULL' THEN total ELSE round(total * 0.4, 2) END,
             LEAST("issueDate" + (abs(hashtext(id::text || 'd')) % 6), ${today}::date), now()
      FROM chosen WHERE kind IS NOT NULL RETURNING "invoiceId", amount
    )
    UPDATE "Invoice" i SET "amountPaid" = ins.amount, status = (CASE WHEN ins.amount >= i.total THEN 'PAID' ELSE 'PARTIALLY_PAID' END)::"InvoiceStatus"
    FROM ins WHERE i.id = ins."invoiceId"`;
  return { flipped, payments };
}
