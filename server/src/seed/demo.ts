import { Prisma, type PrismaClient } from '@prisma/client';
import { addDays, dateOnly } from '../lib/dates.js';
import { FIXTURE_IDS } from '../lib/fixtures.js';
import type { Principal } from '../middleware/auth.js';
import { confirm } from '../modules/invoices/service.js';
import { recordPayment } from '../modules/payments/service.js';
import { create, createFromTemplate, scheduleCancellation, transition } from '../modules/subscriptions/service.js';
import type { SeedCatalog } from './catalog.js';

// The demo story: a handful of subscriptions covering every state a presenter wants to show. They are created through the
// real services (so validation, numbering and history are real) and their invoices come from the billing engine; only
// confirmation and payments are applied on top, through the real invoice/payment services.
const ADMIN: Principal = { id: FIXTURE_IDS.users.admin, role: 'ADMIN' };
export const DEMO_MARKER = 'seed:demo:';

type Pay = 'paid' | 'partial' | 'open';
interface Spec {
  key: string; customer: string; plan: number; lines: Array<{ product: number; variant?: number; qty: number }>;
  start: number; expiry?: number; terms?: number; target: 'ACTIVE' | 'QUOTATION' | 'DRAFT'; template?: 'crmStarter';
  pattern?: Pay[]; after?: 'PAUSE' | 'CANCEL_AT_END';
}
const { customerAcme: ACME, customerNorthwind: NORTHWIND, customerGlobex: GLOBEX } = FIXTURE_IDS.users;
const SPECS: Spec[] = [
  { key: 'acme-crm-monthly', customer: ACME, plan: 0, lines: [{ product: 0, variant: 0, qty: 3 }], start: -75, target: 'ACTIVE', pattern: ['paid', 'partial', 'open'] },
  { key: 'northwind-yearly-seats', customer: NORTHWIND, plan: 1, lines: [{ product: 0, variant: 1, qty: 6 }], start: -20, terms: 30, target: 'ACTIVE', pattern: ['open'] },
  { key: 'globex-paused', customer: GLOBEX, plan: 0, lines: [{ product: 1, variant: 1, qty: 2 }], start: -50, target: 'ACTIVE', after: 'PAUSE' },
  { key: 'acme-weekly-cancelling', customer: ACME, plan: 2, lines: [{ product: 5, qty: 2 }], start: -30, target: 'ACTIVE', pattern: ['paid', 'paid', 'paid', 'paid', 'open'], after: 'CANCEL_AT_END' },
  { key: 'northwind-team', customer: NORTHWIND, plan: 4, lines: [{ product: 2, qty: 5 }, { product: 6, qty: 1 }], start: -10, target: 'ACTIVE', pattern: ['paid'] },
  { key: 'globex-expired', customer: GLOBEX, plan: 0, lines: [{ product: 4, qty: 1 }], start: -200, expiry: -20, target: 'ACTIVE' },
  { key: 'acme-enterprise-quote', customer: ACME, plan: 5, lines: [{ product: 0, variant: 1, qty: 10 }], start: 15, target: 'QUOTATION' },
  { key: 'northwind-trial-draft', customer: NORTHWIND, plan: 3, lines: [{ product: 9, qty: 1 }], start: 3, target: 'DRAFT' },
  { key: 'globex-from-template', customer: GLOBEX, plan: 0, lines: [], start: -5, terms: 15, target: 'ACTIVE', template: 'crmStarter', pattern: ['open'] },
];

const marker = (key: string) => `${DEMO_MARKER}${key}`;

/** Creates the demo subscriptions that do not exist yet (idempotent by marker) and moves them to their target status. */
export async function seedDemoSubscriptions(db: PrismaClient, catalog: SeedCatalog, today: string): Promise<number> {
  let created = 0;
  for (const spec of SPECS) {
    if (await db.subscription.findFirst({ where: { notes: marker(spec.key) }, select: { id: true } })) continue;
    const startDate = addDays(today, spec.start);
    const sub = spec.template
      ? await createFromTemplate({ templateId: catalog.templates[spec.template], customerId: spec.customer, startDate, paymentTermsDays: spec.terms ?? 15, notes: marker(spec.key) }, ADMIN)
      : await create({
        customerId: spec.customer, planId: catalog.plans[spec.plan]!.id, startDate, expiryDate: spec.expiry === undefined ? null : addDays(today, spec.expiry), paymentTermsDays: spec.terms ?? 15, notes: marker(spec.key),
        lines: spec.lines.map(l => ({ productId: catalog.products[l.product]!.id, variantId: l.variant === undefined ? null : catalog.products[l.product]!.variants[l.variant]!.id, quantity: l.qty })),
      }, ADMIN);
    const path = spec.target === 'ACTIVE' ? ['QUOTATION', 'CONFIRMED', 'ACTIVE'] : spec.target === 'QUOTATION' ? ['QUOTATION'] : [];
    for (const to of path) await transition(sub.id, { to: to as 'QUOTATION', reason: 'Seeded demo data' }, ADMIN);
    created += 1;
  }
  return created;
}

const METHODS = ['UPI', 'BANK_TRANSFER', 'CARD', 'CASH'] as const;

/**
 * After billing has produced the invoices: pause / schedule the end where the story needs it, confirm every invoice,
 * and settle them per the spec (paid / partial / open). Safe to run again: it only touches DRAFT invoices and
 * CONFIRMED invoices without payments.
 */
export async function finishDemoSubscriptions(db: PrismaClient, today: string): Promise<{ confirmed: number; payments: number }> {
  const result = { confirmed: 0, payments: 0 };
  for (const spec of SPECS) {
    const sub = await db.subscription.findFirst({ where: { notes: marker(spec.key) }, select: { id: true, status: true, cancelScheduledAt: true } });
    if (!sub) continue;
    if (spec.after === 'PAUSE' && sub.status === 'ACTIVE') await transition(sub.id, { to: 'PAUSED', reason: 'Customer paused for a quarter' }, ADMIN);
    if (spec.after === 'CANCEL_AT_END' && sub.status === 'ACTIVE' && !sub.cancelScheduledAt) await scheduleCancellation(sub.id, { reason: 'Customer asked to stop after this period' }, ADMIN);
    const invoices = await db.invoice.findMany({ where: { subscriptionId: sub.id }, orderBy: { periodStart: 'asc' }, select: { id: true } });
    for (const [index, { id }] of invoices.entries()) {
      let invoice = await db.invoice.findUniqueOrThrow({ where: { id }, include: { payments: { select: { id: true } } } });
      if (invoice.status === 'DRAFT') { await confirm(id, ADMIN); result.confirmed += 1; invoice = await db.invoice.findUniqueOrThrow({ where: { id }, include: { payments: { select: { id: true } } } }); }
      const plan: Pay = spec.pattern?.[index] ?? 'paid';
      if (invoice.status !== 'CONFIRMED' || invoice.payments.length > 0 || plan === 'open') continue;
      const amount = plan === 'paid' ? invoice.total : invoice.total.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const issued = dateOnly(invoice.issueDate); const date = addDays(issued, 2) > today ? today : addDays(issued, 2);
      await recordPayment({ invoiceId: id, method: METHODS[(index + spec.key.length) % METHODS.length]!, amount: amount.toFixed(2), date, note: 'Seeded demo payment' }, ADMIN);
      result.payments += 1;
    }
  }
  return result;
}
