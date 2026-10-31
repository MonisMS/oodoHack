import { z } from 'zod';

export const role = z.enum(['ADMIN', 'STAFF', 'CUSTOMER']);
export const subscriptionStatus = z.enum(['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED']);
export const invoiceStatus = z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']);
export const paymentMethod = z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD']);
export const id = z.string().uuid();
export const idParams = z.object({ id }).strict();
export const variantParams = z.object({ id, variantId: id }).strict();
// Transport money in major currency units, never floating point JSON numbers.
export const money = z.string().regex(/^(0|[1-9]\d{0,11})\.\d{2}$/, 'Use a nonnegative decimal string with two places');
export const positiveMoney = money.refine(v => Number(v) > 0, 'Must be greater than zero');
export const percentage = z.string().regex(/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/).refine(v => Number(v) <= 100, 'Maximum is 100');
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Use a real calendar date YYYY-MM-DD');
export const password = z.string().min(9).max(72).regex(/[A-Z]/, 'Needs uppercase').regex(/[a-z]/, 'Needs lowercase').regex(/[^A-Za-z0-9\s]/, 'Needs a special character').refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Maximum bcrypt input is 72 bytes');
const name = z.string().trim().min(1).max(120);
const title = z.string().trim().min(1).max(160);
const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const note = z.string().max(4000);
const ids = z.array(id).max(100).refine(v => new Set(v).size === v.length, 'IDs must be unique');
export const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(160).optional(), sortBy: z.enum(['createdAt', 'name', 'number', 'dueDate', 'nextInvoiceDate', 'date']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();
export const customerQuery = listQuery.extend({});
export const subscriptionQuery = listQuery.extend({ status: subscriptionStatus.optional(), customerId: id.optional(), planId: id.optional() });
export const invoiceQuery = listQuery.extend({ status: invoiceStatus.optional(), customerId: id.optional(), planId: id.optional(), from: date.optional(), to: date.optional(), overdue: z.enum(['true','false']).optional() });
export const portalSubscriptionQuery = listQuery.extend({ status: subscriptionStatus.optional() });
export const portalInvoiceQuery = listQuery.extend({ status: invoiceStatus.optional(), overdue: z.enum(['true','false']).optional() });
export const paymentQuery = listQuery.extend({ invoiceId: id.optional(), customerId: id.optional(), method: paymentMethod.optional(), from: date.optional(), to: date.optional() });
export const reportQuery = z.object({ from: date.optional(), to: date.optional(), customerId: id.optional(), planId: id.optional(), status: subscriptionStatus.optional() }).strict().refine(v => !v.from || !v.to || v.from <= v.to, { message: 'from must be <= to', path: ['to'] });
export const signupInput = z.object({ name, email, password }).strict();
export const loginInput = z.object({ email, password: z.string().min(1).max(256) }).strict();
export const forgotPasswordInput = z.object({ email }).strict();
export const resetPasswordInput = z.object({ token: z.string().min(32).max(256), password }).strict();
export const staffInput = signupInput;
export const variantInput = z.object({ attribute: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(80), extraPrice: money, isActive: z.boolean().default(true) }).strict();
export const productInput = z.object({ name: title, type: z.enum(['SERVICE','DIGITAL','PHYSICAL']), salesPrice: money, costPrice: money, notes: note.nullable().optional(), isActive: z.boolean().default(true), taxIds: ids.default([]) }).strict();
export const planInput = z.object({ name: title, price: money, billingPeriod: z.enum(['DAILY','WEEKLY','MONTHLY','YEARLY']), minQuantity: z.number().int().min(1), availableFrom: date.nullable().default(null), availableTo: date.nullable().default(null), autoClose: z.boolean(), closableEarly: z.boolean(), pausable: z.boolean(), renewable: z.boolean(), isActive: z.boolean().default(true), taxIds: ids.default([]) }).strict().refine(v => !v.availableFrom || !v.availableTo || v.availableFrom < v.availableTo, { path: ['availableTo'], message: 'Must be after availableFrom' });
export const taxInput = z.object({ name: z.string().trim().min(1).max(100), percentage, isActive: z.boolean().default(true), productIds: ids.default([]), planIds: ids.default([]) }).strict();
export const discountInput = z.object({ name, type: z.enum(['FIXED','PERCENTAGE']), scope: z.enum(['PRODUCT','SUBSCRIPTION']), value: positiveMoney, minPurchase: money.nullable().default(null), minQuantity: z.number().int().min(1).nullable().default(null), startsAt: date, endsAt: date.nullable().default(null), usageLimit: z.number().int().min(1).nullable().default(null), isActive: z.boolean().default(true), productIds: ids.default([]) }).strict()
  .refine(v => v.type !== 'PERCENTAGE' || Number(v.value) <= 100, { path: ['value'], message: 'Percentage maximum is 100' })
  .refine(v => !v.endsAt || v.startsAt <= v.endsAt, { path: ['endsAt'], message: 'Must be on or after startsAt' })
  .refine(v => v.scope === 'PRODUCT' ? v.productIds.length > 0 : v.productIds.length === 0, { path: ['productIds'], message: 'Product scope requires products; subscription scope requires none' });
export const lineInput = z.object({ productId: id, variantId: id.nullable().default(null), quantity: z.number().int().min(1).max(1000000), unitPrice: money.optional() }).strict();
export const templateInput = z.object({ name: title, planId: id, validityDays: z.number().int().min(1).max(3650), isActive: z.boolean().default(true), lines: z.array(lineInput).min(1).max(100) }).strict();
export const subscriptionInput = z.object({ customerId: id, planId: id, startDate: date, expiryDate: date.nullable().default(null), paymentTermsDays: z.number().int().min(0).max(365), notes: note.nullable().optional(), lines: z.array(lineInput).min(1).max(100) }).strict().refine(v => !v.expiryDate || v.expiryDate >= v.startDate, { path: ['expiryDate'], message: 'Must be on or after startDate' });
export const fromTemplateInput = z.object({ templateId: id, customerId: id, startDate: date, paymentTermsDays: z.number().int().min(0).max(365), notes: note.nullable().optional() }).strict();
export const transitionInput = z.object({ to: subscriptionStatus, reason: z.string().max(500).optional(), renewalExpiryDate: date.optional() }).strict();
export const billingInput = z.object({ asOfDate: date, maxPeriodsPerSubscription: z.number().int().min(1).max(120).default(24) }).strict();
export const paymentInput = z.object({ invoiceId: id, method: paymentMethod, amount: positiveMoney, date, note: note.nullable().optional() }).strict();
