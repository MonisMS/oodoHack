import type { PrismaClient } from '@prisma/client';
import { createCredentialUser } from '../lib/auth.js';
import { DEMO_PASSWORD, FIXTURE_IDS, FIXTURE_USERS } from '../lib/fixtures.js';
import { stableUuid } from './support.js';

type Db = PrismaClient;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export interface SeedCatalog {
  taxes: { gst18: string; gst5: string };
  products: Array<{ id: string; name: string; price: string; variants: Array<{ id: string; extra: string }> }>;
  plans: Array<{ id: string; name: string; price: string; period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; minQuantity: number }>;
  templates: { crmStarter: string; teamBundle: string };
}

/** The six fixture accounts (admin, two staff, three customers). Created through the real credential path, so they can sign in. */
export async function seedUsers(db: Db): Promise<number> {
  let created = 0;
  for (const user of FIXTURE_USERS) {
    if (await db.user.findFirst({ where: { OR: [{ id: user.id }, { email: user.email }] }, select: { id: true } })) continue;
    await createCredentialUser({ id: user.id, name: user.name, email: user.email, password: DEMO_PASSWORD, role: user.role });
    created += 1;
  }
  return created;
}

const PRODUCTS: Array<{ key: string; id?: string; name: string; type: 'SERVICE' | 'DIGITAL' | 'PHYSICAL'; price: string; cost: string; notes: string; variants: Array<{ id?: string; attribute: string; value: string; extra: string }> }> = [
  { key: 'crm', id: FIXTURE_IDS.catalog.productCrm, name: 'Odoo CRM Suite', type: 'SERVICE', price: '1000.00', cost: '400.00', notes: 'Pipeline, quotes and forecasting.', variants: [{ id: FIXTURE_IDS.catalog.variantCrmOdoo, attribute: 'Brand', value: 'Odoo', extra: '560.00' }, { id: FIXTURE_IDS.catalog.variantCrmOther, attribute: 'Brand', value: 'Other', extra: '0.00' }] },
  { key: 'helpdesk', name: 'Helpdesk Pro', type: 'SERVICE', price: '750.00', cost: '300.00', notes: 'Ticketing with SLA tracking.', variants: [{ attribute: 'Edition', value: 'Standard', extra: '0.00' }, { attribute: 'Edition', value: 'Premium', extra: '250.00' }] },
  { key: 'inventory', name: 'Inventory Manager', type: 'DIGITAL', price: '900.00', cost: '350.00', notes: 'Stock, warehouses and barcodes.', variants: [] },
  { key: 'accounting', name: 'Accounting Plus', type: 'SERVICE', price: '1200.00', cost: '500.00', notes: 'Invoicing, bank sync and reports.', variants: [{ attribute: 'Region', value: 'India (GST)', extra: '0.00' }, { attribute: 'Region', value: 'Global', extra: '300.00' }] },
  { key: 'projects', name: 'Project Tracker', type: 'DIGITAL', price: '600.00', cost: '200.00', notes: 'Tasks, timesheets and boards.', variants: [] },
  { key: 'esign', name: 'E-Sign Pack', type: 'DIGITAL', price: '300.00', cost: '90.00', notes: 'Legally binding e-signatures.', variants: [] },
  { key: 'analytics', name: 'Analytics Add-on', type: 'SERVICE', price: '450.00', cost: '150.00', notes: 'Dashboards and exports.', variants: [] },
  { key: 'support', name: 'Support Plus', type: 'SERVICE', price: '500.00', cost: '250.00', notes: 'Priority support with a named engineer.', variants: [{ attribute: 'Hours', value: '10 / month', extra: '0.00' }, { attribute: 'Hours', value: '40 / month', extra: '1500.00' }] },
  { key: 'onboarding', name: 'Onboarding Package', type: 'SERVICE', price: '2500.00', cost: '1200.00', notes: 'Guided setup and data migration.', variants: [] },
  { key: 'training', name: 'Training Credits', type: 'SERVICE', price: '200.00', cost: '80.00', notes: 'Workshops and certification.', variants: [] },
];

const PLANS: Array<{ key: string; id?: string; name: string; price: string; period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; minQuantity: number; autoClose: boolean; closableEarly: boolean; pausable: boolean; renewable: boolean }> = [
  { key: 'monthly', id: FIXTURE_IDS.catalog.planMonthly, name: 'Monthly', price: '500.00', period: 'MONTHLY', minQuantity: 1, autoClose: true, closableEarly: true, pausable: true, renewable: true },
  { key: 'yearly', id: FIXTURE_IDS.catalog.planYearly, name: 'Yearly (contract)', price: '5000.00', period: 'YEARLY', minQuantity: 1, autoClose: true, closableEarly: false, pausable: false, renewable: true },
  { key: 'weekly', name: 'Weekly Starter', price: '150.00', period: 'WEEKLY', minQuantity: 1, autoClose: true, closableEarly: true, pausable: true, renewable: false },
  { key: 'daily', name: 'Daily Trial', price: '20.00', period: 'DAILY', minQuantity: 1, autoClose: true, closableEarly: true, pausable: false, renewable: false },
  { key: 'team', name: 'Monthly Team (5+ seats)', price: '900.00', period: 'MONTHLY', minQuantity: 5, autoClose: true, closableEarly: true, pausable: true, renewable: true },
  { key: 'enterprise', name: 'Yearly Enterprise (10+ seats)', price: '12000.00', period: 'YEARLY', minQuantity: 10, autoClose: true, closableEarly: false, pausable: false, renewable: true },
];

/** Taxes, 10 products with variants, 6 plans, 3 discounts and 2 quotation templates. Every id is fixed or derived, so re-running changes nothing. */
export async function seedCatalog(db: Db, today: string): Promise<SeedCatalog> {
  const gst18 = FIXTURE_IDS.catalog.taxGst18; const gst5 = FIXTURE_IDS.catalog.taxGst5;
  await db.tax.upsert({ where: { id: gst18 }, update: {}, create: { id: gst18, name: 'GST 18%', percentage: '18' } });
  await db.tax.upsert({ where: { id: gst5 }, update: {}, create: { id: gst5, name: 'GST 5%', percentage: '5' } });

  const products: SeedCatalog['products'] = [];
  for (const p of PRODUCTS) {
    const id = p.id ?? stableUuid('product', p.key);
    await db.product.upsert({ where: { id }, update: {}, create: { id, name: p.name, type: p.type, salesPrice: p.price, costPrice: p.cost, notes: p.notes, taxes: { connect: [{ id: gst18 }] } } });
    const variants: SeedCatalog['products'][number]['variants'] = [];
    for (const v of p.variants) {
      const variantId = v.id ?? stableUuid('variant', `${p.key}:${v.value}`);
      await db.productVariant.upsert({ where: { id: variantId }, update: {}, create: { id: variantId, productId: id, attribute: v.attribute, value: v.value, extraPrice: v.extra } });
      variants.push({ id: variantId, extra: v.extra });
    }
    products.push({ id, name: p.name, price: p.price, variants });
  }

  const plans: SeedCatalog['plans'] = [];
  for (const p of PLANS) {
    const id = p.id ?? stableUuid('plan', p.key);
    await db.plan.upsert({ where: { id }, update: {}, create: { id, name: p.name, price: p.price, billingPeriod: p.period, minQuantity: p.minQuantity, autoClose: p.autoClose, closableEarly: p.closableEarly, pausable: p.pausable, renewable: p.renewable, taxes: { connect: [{ id: gst18 }] } } });
    plans.push({ id, name: p.name, price: p.price, period: p.period, minQuantity: p.minQuantity });
  }

  const yearAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  await db.discount.upsert({ where: { id: FIXTURE_IDS.catalog.discountSeats }, update: {}, create: { id: FIXTURE_IDS.catalog.discountSeats, name: '10% off for 5+ seats', type: 'PERCENTAGE', scope: 'SUBSCRIPTION', value: '10', minQuantity: 5, startsAt: day(yearAgo) } });
  await db.discount.upsert({ where: { id: stableUuid('discount', 'fixed') }, update: {}, create: { id: stableUuid('discount', 'fixed'), name: 'Rs 500 off orders above Rs 5,000', type: 'FIXED', scope: 'SUBSCRIPTION', value: '500', minPurchase: '5000', startsAt: day(yearAgo), usageLimit: 50 } });
  await db.discount.upsert({ where: { id: stableUuid('discount', 'expired') }, update: {}, create: { id: stableUuid('discount', 'expired'), name: 'Launch offer 20% (ended)', type: 'PERCENTAGE', scope: 'SUBSCRIPTION', value: '20', startsAt: day(yearAgo), endsAt: day(monthAgo) } });

  const crm = products[0]!; const team = products[1]!;
  const crmStarter = stableUuid('template', 'crm-starter'); const teamBundle = stableUuid('template', 'team-bundle');
  if (!(await db.quotationTemplate.findUnique({ where: { id: crmStarter }, select: { id: true } }))) {
    await db.quotationTemplate.create({ data: { id: crmStarter, name: 'CRM Starter (monthly)', planId: plans[0]!.id, validityDays: 30, lines: { create: [{ productId: crm.id, variantId: crm.variants[0]!.id, quantity: 2, position: 0 }] } } });
  }
  if (!(await db.quotationTemplate.findUnique({ where: { id: teamBundle }, select: { id: true } }))) {
    await db.quotationTemplate.create({ data: { id: teamBundle, name: 'Team Bundle (yearly, 10 seats)', planId: plans[5]!.id, validityDays: 60, lines: { create: [{ productId: crm.id, variantId: crm.variants[1]!.id, quantity: 10, position: 0 }, { productId: team.id, variantId: team.variants[1]!.id, quantity: 10, position: 1 }] } } });
  }
  return { taxes: { gst18, gst5 }, products, plans, templates: { crmStarter, teamBundle } };
}
