import type { Prisma, SubscriptionStatus } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { lockRow } from '../../lib/locks.js';
import { nextNumber } from '../../lib/numbers.js';
import { planSubscriptionTransition } from '../../lib/domain/states.js';
import { addDays, assertCustomer, assertPlanSelectable, assertScheduleBounds, dateOnly, parseDate, resolveLines, todayBusiness, totalQuantity, type LineIn, type Tx } from '../../lib/catalog-lines.js';
import type { Principal } from '../../middleware/auth.js';
import { allowedTransitions, canTransition, needsRevalidation } from './rules.js';
import type { cancellationInput, changeLinesInput, fromTemplateInput, subscriptionInput, subscriptionQuery, transitionInput } from './schemas.js';

type Query = z.infer<typeof subscriptionQuery>;
type Input = z.infer<typeof subscriptionInput>;
type FromTemplateInput = z.infer<typeof fromTemplateInput>;
type TransitionInput = z.infer<typeof transitionInput>;
type CancellationInput = z.infer<typeof cancellationInput>;
type ChangeLinesInput = z.infer<typeof changeLinesInput>;
// Shape both create paths feed into `insert`; template lines may leave unitPrice to be resolved from the catalog.
interface NewSubscription { customerId: string; planId: string; startDate: string; expiryDate: string | null; paymentTermsDays: number; notes?: string | null; lines: LineIn[] }

const include = {
  plan: true,
  lines: { orderBy: { position: 'asc' } },
  history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.SubscriptionInclude;
type Row = Prisma.SubscriptionGetPayload<{ include: typeof include }>;

// Wire shape of the contract's Subscription. `allowedTransitions` is an A-03 addition so screens follow server policy.
export function toSubscriptionDto(s: Row) {
  const expiryDate = s.expiryDate ? dateOnly(s.expiryDate) : null;
  return {
    id: s.id, number: s.number, customerId: s.customerId, planId: s.planId, templateId: s.templateId, status: s.status,
    startDate: dateOnly(s.startDate), expiryDate, nextInvoiceDate: dateOnly(s.nextInvoiceDate),
    billingAnchorDay: s.billingAnchorDay, billingAnchorMonth: s.billingAnchorMonth, paymentTermsDays: s.paymentTermsDays, notes: s.notes,
    lines: s.lines.map(l => ({ id: l.id, subscriptionId: l.subscriptionId, productId: l.productId, variantId: l.variantId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice.toFixed(2), position: l.position })),
    history: s.history.map(e => ({ id: e.id, subscriptionId: e.subscriptionId, fromStatus: e.fromStatus, toStatus: e.toStatus, actorId: e.actorId, reason: e.reason, createdAt: e.createdAt.toISOString() })),
    planPrice: s.planPrice ? s.planPrice.toFixed(2) : null,
    cancelAtPeriodEnd: s.cancelScheduledAt !== null,
    billingDue: isBillingDue(s),
    allowedTransitions: allowedTransitions(s.status, { plan: s.plan, expiryDate, today: todayBusiness() }),
    createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  };
}

/** An ACTIVE subscription whose next invoice date has arrived (and is not past its expiry) has billing waiting to run. */
export function isBillingDue(s: { status: SubscriptionStatus; nextInvoiceDate: Date; expiryDate: Date | null }, today = todayBusiness()) {
  const next = dateOnly(s.nextInvoiceDate);
  return s.status === 'ACTIVE' && next <= today && (!s.expiryDate || next <= dateOnly(s.expiryDate));
}

const schedule = (startDate: string) => {
  const start = parseDate(startDate);
  // Billing is anchored to the start date so month-end clamping never drifts (Jan 31 -> Feb 28 -> Mar 31).
  return { startDate: start, nextInvoiceDate: start, billingAnchorDay: start.getUTCDate(), billingAnchorMonth: start.getUTCMonth() + 1 };
};

const lock = (tx: Tx, id: string) => lockRow(tx, 'Subscription', id, 'Subscription not found');

/** Validates customer, plan, lines and (for create) assigns the number. Returns the data for nested line creation. */
async function validate(tx: Tx, input: NewSubscription) {
  assertScheduleBounds(input.startDate, input.expiryDate);
  await assertCustomer(tx, input.customerId);
  const [plan, lines] = await Promise.all([tx.plan.findUnique({ where: { id: input.planId } }), resolveLines(tx, input.lines, 'freeze')]);
  assertPlanSelectable(plan, input.startDate, totalQuantity(lines));
  return { plan, lines: lines.map((l, position) => ({ productId: l.productId, variantId: l.variantId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice as string, position })) };
}

async function insert(tx: Tx, input: NewSubscription, templateId: string | null) {
  const { plan, lines } = await validate(tx, input);
  const number = await nextNumber(tx, 'SUB', Number(todayBusiness().slice(0, 4)));
  const created = await tx.subscription.create({
    data: { number, customerId: input.customerId, planId: input.planId, templateId, status: 'DRAFT', ...schedule(input.startDate), expiryDate: input.expiryDate ? parseDate(input.expiryDate) : null, paymentTermsDays: input.paymentTermsDays, notes: input.notes ?? null, planPrice: plan.price, lines: { create: lines } },
    select: { id: true },
  });
  return created.id;
}

export async function list(q: Query, _actor: Principal) {
  const where: Prisma.SubscriptionWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.customerId) where.customerId = q.customerId;
  if (q.planId) where.planId = q.planId;
  if (q.search) where.OR = [
    { number: { contains: q.search, mode: 'insensitive' } },
    { customer: { name: { contains: q.search, mode: 'insensitive' } } },
    { customer: { email: { contains: q.search, mode: 'insensitive' } } },
  ];
  const dir = q.sortOrder;
  const orderBy: Prisma.SubscriptionOrderByWithRelationInput =
    q.sortBy === 'number' ? { number: dir } : q.sortBy === 'nextInvoiceDate' ? { nextInvoiceDate: dir } : q.sortBy === 'date' ? { startDate: dir } : q.sortBy === 'name' ? { customer: { name: dir } } : { createdAt: dir };
  const [rows, total] = await Promise.all([
    db.subscription.findMany({ where, include, orderBy: [orderBy, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.subscription.count({ where }),
  ]);
  return { data: rows.map(toSubscriptionDto), page: q.page, pageSize: q.pageSize, total };
}

export async function get(id: string, _actor: Principal) {
  const row = await db.subscription.findUnique({ where: { id }, include });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Subscription not found');
  return toSubscriptionDto(row);
}

export async function create(input: Input, actor: Principal) {
  return get(await db.$transaction(tx => insert(tx, input, null)), actor);
}

export async function createFromTemplate(input: FromTemplateInput, actor: Principal) {
  const id = await db.$transaction(async tx => {
    const template = await tx.quotationTemplate.findUnique({ where: { id: input.templateId }, include: { lines: { orderBy: { position: 'asc' } } } });
    if (!template || !template.isActive) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { templateId: ['Template not found or inactive'] });
    // Lines are independent copies; missing template prices resolve from the catalog now and are then frozen.
    const lines = template.lines.map(l => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, ...(l.unitPrice ? { unitPrice: l.unitPrice.toFixed(2) } : {}) }));
    return insert(tx, { customerId: input.customerId, planId: template.planId, startDate: input.startDate, expiryDate: addDays(input.startDate, template.validityDays), paymentTermsDays: input.paymentTermsDays, notes: input.notes ?? null, lines }, template.id);
  });
  return get(id, actor);
}

export async function replace(id: string, input: Input, actor: Principal) {
  await db.$transaction(async tx => {
    await lock(tx, id);
    const current = await tx.subscription.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (current.status !== 'DRAFT' && current.status !== 'QUOTATION') throw new AppError(409, 'CONFLICT', 'Only DRAFT or QUOTATION subscriptions can be edited');
    const { plan, lines } = await validate(tx, input);
    await tx.subscriptionLine.deleteMany({ where: { subscriptionId: id } });
    await tx.subscription.update({
      where: { id },
      data: { customerId: input.customerId, planId: input.planId, ...schedule(input.startDate), expiryDate: input.expiryDate ? parseDate(input.expiryDate) : null, paymentTermsDays: input.paymentTermsDays, notes: input.notes ?? null, planPrice: plan.price, lines: { create: lines } },
    });
  });
  return get(id, actor);
}

export async function remove(id: string, _actor: Principal) {
  await db.$transaction(async tx => {
    await lock(tx, id);
    const row = await tx.subscription.findUniqueOrThrow({ where: { id }, select: { status: true, _count: { select: { invoices: true } } } });
    if (row.status !== 'DRAFT' || row._count.invoices > 0) throw new AppError(409, 'CONFLICT', 'Only DRAFT subscriptions without invoices can be deleted');
    await tx.subscription.delete({ where: { id } });
  });
}

export async function transition(id: string, input: TransitionInput, actor: Principal) {
  await db.$transaction(async tx => {
    await lock(tx, id);
    // Re-read under the row lock so two concurrent transitions cannot both act on a stale status.
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true, lines: true } });
    const from: SubscriptionStatus = sub.status;
    const expiryDate = sub.expiryDate ? dateOnly(sub.expiryDate) : null;
    const check = canTransition(from, input.to, { plan: sub.plan, expiryDate, today: todayBusiness(), renewalExpiryDate: input.renewalExpiryDate ?? null });
    if (!check.ok) throw new AppError(409, 'INVALID_TRANSITION', check.reason);
    if (needsRevalidation(from, input.to)) {
      if (sub.lines.length === 0) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { lines: ['A subscription needs at least one line'] });
      await assertCustomer(tx, sub.customerId);
      assertPlanSelectable(sub.plan, dateOnly(sub.startDate), totalQuantity(sub.lines));
    }
    const coverage = await tx.invoice.aggregate({ where: { subscriptionId: id }, _max: { periodEnd: true } });
    const change = planSubscriptionTransition(from,input.to,{
      plan:sub.plan,expiryDate,today:todayBusiness(),renewalExpiryDate:input.renewalExpiryDate,
      nextInvoiceDate:dateOnly(sub.nextInvoiceDate),billingAnchorDay:sub.billingAnchorDay,billingAnchorMonth:sub.billingAnchorMonth,
      lastInvoicePeriodEnd:coverage._max.periodEnd ? dateOnly(coverage._max.periodEnd) : null,
    });
    // The planner preserves issued coverage, blocks discarded active debt and waives paused/closed gaps.
    // Renewal starts a new term, so it re-prices to the plan's current fee and drops any scheduled cancellation.
    const renewing = from === 'CLOSED' && input.to === 'ACTIVE';
    await tx.subscription.update({ where:{id},data:{status:change.status,nextInvoiceDate:parseDate(change.nextInvoiceDate),billingAnchorDay:change.billingAnchorDay,billingAnchorMonth:change.billingAnchorMonth,expiryDate:change.expiryDate ? parseDate(change.expiryDate) : null,...(renewing ? { planPrice: sub.plan.price, cancelScheduledAt: null, expiryBeforeCancellation: null } : {})} });
    await tx.subscriptionEvent.create({ data: { subscriptionId: id, fromStatus: from, toStatus: input.to, actorId: actor.id, reason: input.reason ?? null } });
  });
  return get(id, actor);
}

const backlog = () => new AppError(409, 'BILLING_BACKLOG', 'Run billing for the periods that are already due, then try again');

/**
 * "Cancel at period end": the customer keeps what they already paid for and nothing further is invoiced.
 * Implemented by moving expiryDate to the last invoiced day (the original is kept so it can be withdrawn); billing stops
 * invoicing at expiry and, for autoClose plans, closes the subscription automatically afterwards.
 */
export async function scheduleCancellation(id: string, input: CancellationInput, actor: Principal) {
  await db.$transaction(async tx => {
    await lock(tx, id);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } });
    if (sub.status !== 'ACTIVE') throw new AppError(409, 'INVALID_TRANSITION', `Only ACTIVE subscriptions can be scheduled for cancellation (this one is ${sub.status})`);
    if (sub.cancelScheduledAt) throw new AppError(409, 'CONFLICT', `Cancellation is already scheduled for ${dateOnly(sub.expiryDate as Date)}`);
    if (!sub.plan.closableEarly) throw new AppError(409, 'INVALID_TRANSITION', 'This plan does not allow ending before the expiry date');
    if (isBillingDue(sub)) throw backlog(); // ending now would silently drop periods that were delivered but not yet invoiced
    const endsOn = addDays(dateOnly(sub.nextInvoiceDate), -1); // the last day that is already invoiced
    if (endsOn < dateOnly(sub.startDate)) throw new AppError(409, 'CONFLICT', 'Nothing has been invoiced yet; close the subscription instead');
    const current = sub.expiryDate ? dateOnly(sub.expiryDate) : null;
    if (current && current <= endsOn) throw new AppError(409, 'CONFLICT', `The subscription already ends on ${current}`);
    await tx.subscription.update({ where: { id }, data: { expiryDate: parseDate(endsOn), cancelScheduledAt: new Date(), expiryBeforeCancellation: sub.expiryDate } });
    await tx.subscriptionEvent.create({ data: { subscriptionId: id, fromStatus: sub.status, toStatus: sub.status, actorId: actor.id, reason: `Cancellation scheduled: ends ${endsOn}${input.reason ? ` (${input.reason})` : ''}` } });
  });
  return get(id, actor);
}

/** Withdraws a scheduled cancellation before it takes effect and restores the original expiry. */
export async function unscheduleCancellation(id: string, input: CancellationInput, actor: Principal) {
  await db.$transaction(async tx => {
    await lock(tx, id);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id } });
    if (!sub.cancelScheduledAt) throw new AppError(409, 'CONFLICT', 'No cancellation is scheduled for this subscription');
    if (sub.status !== 'ACTIVE' && sub.status !== 'PAUSED') throw new AppError(409, 'INVALID_TRANSITION', `A ${sub.status} subscription can only be renewed, not resumed`);
    if (sub.expiryDate && dateOnly(sub.expiryDate) < todayBusiness()) throw new AppError(409, 'INVALID_TRANSITION', 'The scheduled end date has already passed; renew the subscription instead');
    await tx.subscription.update({ where: { id }, data: { expiryDate: sub.expiryBeforeCancellation, cancelScheduledAt: null, expiryBeforeCancellation: null } });
    await tx.subscriptionEvent.create({ data: { subscriptionId: id, fromStatus: sub.status, toStatus: sub.status, actorId: actor.id, reason: `Cancellation withdrawn${input.reason ? ` (${input.reason})` : ''}` } });
  });
  return get(id, actor);
}

/**
 * Seat/product changes on a running subscription. The new lines apply from the NEXT invoice: invoices that already exist
 * are immutable, and there is no proration (v1). Not allowed while billing is due, so due periods are never re-priced.
 */
export async function changeLines(id: string, input: ChangeLinesInput, actor: Principal) {
  await db.$transaction(async tx => {
    await lock(tx, id);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } });
    if (sub.status !== 'CONFIRMED' && sub.status !== 'ACTIVE' && sub.status !== 'PAUSED') throw new AppError(409, 'CONFLICT', `Lines of a ${sub.status} subscription are changed by editing it (DRAFT/QUOTATION) or are final (CLOSED)`);
    if (isBillingDue(sub)) throw backlog();
    const resolved = await resolveLines(tx, input.lines, 'freeze');
    const quantity = totalQuantity(resolved);
    if (quantity < sub.plan.minQuantity) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { lines: [`Total quantity ${quantity} is below the plan minimum of ${sub.plan.minQuantity}`] });
    await tx.subscriptionLine.deleteMany({ where: { subscriptionId: id } });
    await tx.subscriptionLine.createMany({ data: resolved.map((l, position) => ({ subscriptionId: id, productId: l.productId, variantId: l.variantId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice as string, position })) });
    await tx.subscription.update({ where: { id }, data: { updatedAt: new Date() } });
    await tx.subscriptionEvent.create({ data: { subscriptionId: id, fromStatus: sub.status, toStatus: sub.status, actorId: actor.id, reason: `Lines changed, effective from the next invoice${input.reason ? ` (${input.reason})` : ''}` } });
  });
  return get(id, actor);
}

