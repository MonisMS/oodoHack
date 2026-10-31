import type { InvoiceStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { dateOnly, parseDate, todayBusiness } from '../../lib/dates.js';
import type { Principal } from '../../middleware/auth.js';
import { invoiceInclude, toInvoiceDto } from '../invoices/service.js';
import { scheduleCancellation, subscriptionInclude, toSubscriptionDto, unscheduleCancellation } from '../subscriptions/service.js';
import type { cancellationInput, portalInvoiceQuery, portalSubscriptionQuery } from './schemas.js';

type SubQuery = z.infer<typeof portalSubscriptionQuery>;
type InvQuery = z.infer<typeof portalInvoiceQuery>;
type CancellationInput = z.infer<typeof cancellationInput>;

// ---------------------------------------------------------------------------------------------------------------------
// Customer portal (D-06). Security boundary: EVERY query below includes `customerId: actor.id`, the customer id is never
// read from the request, and anything that is not the caller's own record is a plain 404 (it must not reveal that the
// record exists). The portal also hides internal data: DRAFT subscriptions, DRAFT/CANCELLED invoices, staff notes, who
// changed what and why, and the internal note / recorder of a payment.
// ---------------------------------------------------------------------------------------------------------------------
const VISIBLE_SUBSCRIPTIONS: SubscriptionStatus[] = ['QUOTATION', 'CONFIRMED', 'ACTIVE', 'PAUSED', 'CLOSED'];
const VISIBLE_INVOICES: InvoiceStatus[] = ['CONFIRMED', 'PARTIALLY_PAID', 'PAID'];
const OPEN: InvoiceStatus[] = ['CONFIRMED', 'PARTIALLY_PAID'];

const ownSubscription = (id: string, actor: Principal): Prisma.SubscriptionWhereInput => ({ id, customerId: actor.id, status: { in: VISIBLE_SUBSCRIPTIONS } });
const ownInvoice = (id: string, actor: Principal): Prisma.InvoiceWhereInput => ({ id, customerId: actor.id, status: { in: VISIBLE_INVOICES } });

type SubRow = Prisma.SubscriptionGetPayload<{ include: typeof subscriptionInclude }>;
export function toPortalSubscription(row: SubRow) {
  const dto = toSubscriptionDto(row);
  const today = todayBusiness();
  const ended = dto.expiryDate !== null && dto.expiryDate < today;
  return {
    ...dto,
    notes: null, // staff notes are internal
    billingDue: false,
    allowedTransitions: [], // customers act through the explicit actions below, never through raw transitions
    history: dto.history.map(e => ({ ...e, actorId: null, reason: null })), // who/why is internal; the timeline of statuses is not
    canScheduleCancellation: dto.status === 'ACTIVE' && row.plan.closableEarly && !dto.cancelAtPeriodEnd && !ended,
    canWithdrawCancellation: (dto.status === 'ACTIVE' || dto.status === 'PAUSED') && dto.cancelAtPeriodEnd && !ended,
  };
}

type InvRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;
export function toPortalInvoice(row: InvRow, today = todayBusiness()) {
  const dto = toInvoiceDto(row, today);
  return {
    ...dto,
    lastReminderAt: null, reminderCount: 0, // dunning history is internal
    payments: dto.payments.map(({ recordedById: _recorder, note: _note, ...payment }) => payment),
  };
}

export async function summary(actor: Principal) {
  const today = parseDate(todayBusiness());
  const [active, open, overdue, upcoming] = await Promise.all([
    db.subscription.count({ where: { customerId: actor.id, status: 'ACTIVE' } }),
    db.invoice.aggregate({ where: { customerId: actor.id, status: { in: OPEN } }, _sum: { total: true, amountPaid: true } }),
    db.invoice.count({ where: { customerId: actor.id, status: { in: OPEN }, dueDate: { lt: today } } }),
    db.subscription.findFirst({ where: { customerId: actor.id, status: 'ACTIVE', OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] }, orderBy: { nextInvoiceDate: 'asc' }, select: { nextInvoiceDate: true, expiryDate: true } }),
  ]);
  const outstanding = open._sum.total ? open._sum.total.minus(open._sum.amountPaid ?? 0) : null;
  const next = upcoming && (!upcoming.expiryDate || upcoming.nextInvoiceDate <= upcoming.expiryDate) ? dateOnly(upcoming.nextInvoiceDate) : null;
  return { activeSubscriptions: active, outstanding: outstanding ? outstanding.toFixed(2) : '0.00', overdueInvoices: overdue, nextInvoiceDate: next };
}

export async function listSubscriptions(q: SubQuery, actor: Principal) {
  const where: Prisma.SubscriptionWhereInput = { customerId: actor.id, status: { in: VISIBLE_SUBSCRIPTIONS } };
  if (q.status) where.status = VISIBLE_SUBSCRIPTIONS.includes(q.status) ? q.status : { in: [] }; // a hidden status simply matches nothing
  if (q.search) where.number = { contains: q.search, mode: 'insensitive' };
  const dir = q.sortOrder;
  const orderBy: Prisma.SubscriptionOrderByWithRelationInput = q.sortBy === 'number' ? { number: dir } : q.sortBy === 'nextInvoiceDate' ? { nextInvoiceDate: dir } : q.sortBy === 'date' ? { startDate: dir } : { createdAt: dir };
  const [rows, total] = await Promise.all([
    db.subscription.findMany({ where, include: subscriptionInclude, orderBy: [orderBy, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.subscription.count({ where }),
  ]);
  return { data: rows.map(toPortalSubscription), page: q.page, pageSize: q.pageSize, total };
}

export async function getSubscription(id: string, actor: Principal) {
  const row = await db.subscription.findFirst({ where: ownSubscription(id, actor), include: subscriptionInclude });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Subscription not found');
  return toPortalSubscription(row);
}

export async function listInvoices(q: InvQuery, actor: Principal) {
  const where: Prisma.InvoiceWhereInput = { customerId: actor.id, status: { in: VISIBLE_INVOICES } };
  if (q.status) where.status = VISIBLE_INVOICES.includes(q.status) ? q.status : { in: [] };
  const overdue: Prisma.InvoiceWhereInput = { status: { in: OPEN }, dueDate: { lt: parseDate(todayBusiness()) } };
  if (q.overdue === 'true') where.AND = [overdue]; // combined with the status filter instead of replacing it
  if (q.overdue === 'false') where.NOT = overdue;
  if (q.search) where.number = { contains: q.search, mode: 'insensitive' };
  const dir = q.sortOrder;
  const orderBy: Prisma.InvoiceOrderByWithRelationInput = q.sortBy === 'number' ? { number: dir } : q.sortBy === 'dueDate' ? { dueDate: dir } : q.sortBy === 'date' ? { issueDate: dir } : { createdAt: dir };
  const today = todayBusiness();
  const [rows, total] = await Promise.all([
    db.invoice.findMany({ where, include: invoiceInclude, orderBy: [orderBy, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.invoice.count({ where }),
  ]);
  return { data: rows.map(i => toPortalInvoice(i, today)), page: q.page, pageSize: q.pageSize, total };
}

export async function getInvoice(id: string, actor: Principal) {
  const row = await db.invoice.findFirst({ where: ownInvoice(id, actor), include: invoiceInclude });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
  return toPortalInvoice(row);
}

// Customer self-service: the same "cancel at period end" staff have, restricted to the customer's own subscription.
// Staff-facing wording about billing runs is replaced by something a customer can act on.
async function ownOrThrow(id: string, actor: Principal) {
  if (!(await db.subscription.findFirst({ where: ownSubscription(id, actor), select: { id: true } }))) throw new AppError(404, 'NOT_FOUND', 'Subscription not found');
}
export async function cancelAtPeriodEnd(id: string, input: CancellationInput, actor: Principal) {
  await ownOrThrow(id, actor);
  try { await scheduleCancellation(id, { reason: input.reason ? `Requested by customer: ${input.reason}` : 'Requested by customer' }, actor); } catch (error) {
    if (error instanceof AppError && error.code === 'BILLING_BACKLOG') throw new AppError(409, 'CONFLICT', 'Your current billing period is still being processed. Please try again shortly.');
    throw error;
  }
  return getSubscription(id, actor);
}
export async function keepSubscription(id: string, input: CancellationInput, actor: Principal) {
  await ownOrThrow(id, actor);
  await unscheduleCancellation(id, { reason: input.reason ? `Customer kept the subscription: ${input.reason}` : 'Customer kept the subscription' }, actor);
  return getSubscription(id, actor);
}
