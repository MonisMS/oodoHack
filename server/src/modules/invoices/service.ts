import type { InvoiceStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import type { FrozenTax } from '../../lib/domain/invoice-draft.js';
import { dateOnly, parseDate, todayBusiness } from '../../lib/dates.js';
import { lockRow } from '../../lib/locks.js';
import type { Principal } from '../../middleware/auth.js';
import { toPaymentDto } from '../payments/service.js';
import { invoiceMailer, renderInvoiceEmail, renderReminderEmail } from './mailer.js';
import { canSend, canTransitionInvoice } from './rules.js';
import type { invoiceQuery } from './schemas.js';

type Query = z.infer<typeof invoiceQuery>;
// Invoices still collecting money. Outstanding and overdue are only defined for these (API_CONTRACT.md).
const OPEN: InvoiceStatus[] = ['CONFIRMED', 'PARTIALLY_PAID'];

export const invoiceInclude = {
  lines: { orderBy: { position: 'asc' } },
  payments: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
  discountUsages: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.InvoiceInclude;
export type InvoiceWithRelations = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

/**
 * Wire shape of the contract's Invoice, shared with the customer portal (D). `outstanding` and `overdue` are
 * A-04 additions so every screen shows the same derived values; overdue = open AND dueDate < today (UTC).
 */
export function toInvoiceDto(i: InvoiceWithRelations, today = todayBusiness()) {
  const open = OPEN.includes(i.status);
  const dueDate = dateOnly(i.dueDate);
  return {
    id: i.id, number: i.number, subscriptionId: i.subscriptionId, customerId: i.customerId, status: i.status,
    periodStart: dateOnly(i.periodStart), periodEnd: dateOnly(i.periodEnd), issueDate: dateOnly(i.issueDate), dueDate,
    customerName: i.customerName, customerEmail: i.customerEmail,
    subtotal: i.subtotal.toFixed(2), discountTotal: i.discountTotal.toFixed(2), taxTotal: i.taxTotal.toFixed(2), total: i.total.toFixed(2), amountPaid: i.amountPaid.toFixed(2),
    outstanding: open ? i.total.minus(i.amountPaid).toFixed(2) : '0.00', overdue: open && dueDate < today,
    currency: i.currency as 'INR', sentAt: i.sentAt ? i.sentAt.toISOString() : null,
    lastReminderAt: i.lastReminderAt ? i.lastReminderAt.toISOString() : null, reminderCount: i.reminderCount,
    lines: i.lines.map(l => ({
      id: l.id, invoiceId: l.invoiceId, kind: l.kind, productId: l.productId, variantId: l.variantId, discountId: l.discountId, description: l.description, quantity: l.quantity,
      unitPrice: l.unitPrice.toFixed(2), subtotal: l.subtotal.toFixed(2), taxTotal: l.taxTotal.toFixed(2), total: l.total.toFixed(2), taxes: l.taxes as unknown as Array<Pick<FrozenTax,'taxId'|'name'|'percentage'|'amount'> & Partial<Pick<FrozenTax,'taxableBase'|'grossBase'|'discountAmount'|'discounts'>>>, position: l.position,
    })),
    payments: i.payments.map(toPaymentDto),
    discountUsages: i.discountUsages.map(u => ({ id: u.id, discountId: u.discountId, invoiceId: u.invoiceId, amount: u.amount.toFixed(2), createdAt: u.createdAt.toISOString() })),
    createdAt: i.createdAt.toISOString(), updatedAt: i.updatedAt.toISOString(),
  };
}

export async function list(q: Query, _actor: Principal) {
  if (q.from && q.to && q.from > q.to) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { to: ['Must be on or after from'] });
  const where: Prisma.InvoiceWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.customerId) where.customerId = q.customerId;
  if (q.planId) where.subscription = { planId: q.planId };
  if (q.from || q.to) where.issueDate = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
  const overdue: Prisma.InvoiceWhereInput = { status: { in: OPEN }, dueDate: { lt: parseDate(todayBusiness()) } };
  if (q.overdue === 'true') Object.assign(where, overdue);
  if (q.overdue === 'false') where.NOT = overdue;
  if (q.search) where.OR = [
    { number: { contains: q.search, mode: 'insensitive' } },
    { customerName: { contains: q.search, mode: 'insensitive' } },
    { customerEmail: { contains: q.search, mode: 'insensitive' } },
  ];
  const dir = q.sortOrder;
  const orderBy: Prisma.InvoiceOrderByWithRelationInput =
    q.sortBy === 'number' ? { number: dir } : q.sortBy === 'dueDate' ? { dueDate: dir } : q.sortBy === 'date' ? { issueDate: dir } : q.sortBy === 'name' ? { customerName: dir } : { createdAt: dir };
  const today = todayBusiness();
  const [rows, total] = await Promise.all([
    db.invoice.findMany({ where, include: invoiceInclude, orderBy: [orderBy, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.invoice.count({ where }),
  ]);
  return { data: rows.map(i => toInvoiceDto(i, today)), page: q.page, pageSize: q.pageSize, total };
}

export async function get(id: string, _actor: Principal) {
  const row = await db.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
  return toInvoiceDto(row);
}

async function transition(id: string, to: 'CONFIRMED' | 'CANCELLED', actor: Principal) {
  await db.$transaction(async tx => {
    await lockRow(tx, 'Invoice', id, 'Invoice not found');
    // Re-read under the row lock so concurrent confirm/cancel/payment cannot act on stale state.
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id }, select: { status: true, total: true, _count: { select: { payments: true } } } });
    const check = canTransitionInvoice(invoice.status, to, { paymentCount: invoice._count.payments });
    if (!check.ok) throw new AppError(409, 'INVALID_TRANSITION', check.reason);
    // A zero-total invoice has nothing to collect, so confirming it settles it immediately.
    const status: InvoiceStatus = to === 'CONFIRMED' && invoice.total.isZero() ? 'PAID' : to;
    await tx.invoice.update({ where: { id }, data: { status } });
  });
  return get(id, actor);
}

export const confirm = (id: string, actor: Principal) => transition(id, 'CONFIRMED', actor);
// Cancelling keeps discount usage history; usage is not refunded in v1.
export const cancel = (id: string, actor: Principal) => transition(id, 'CANCELLED', actor);

/** Emails the invoice built from its frozen values; sentAt is only set after the transport succeeds. */
export async function send(id: string, actor: Principal) {
  const invoice = await db.invoice.findUnique({ where: { id }, include: invoiceInclude });
  if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
  if (!canSend(invoice.status)) throw new AppError(409, 'INVALID_TRANSITION', `Only issued invoices can be sent (this one is ${invoice.status})`);
  const dto = toInvoiceDto(invoice);
  const message = renderInvoiceEmail({ ...dto, lines: dto.lines.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total })) });
  try { await invoiceMailer.send(message); } catch (error) {
    console.error('Invoice email failed', error);
    throw new AppError(502, 'EMAIL_FAILED', 'The invoice email could not be sent; nothing was marked as sent');
  }
  await db.invoice.update({ where: { id }, data: { sentAt: new Date() } });
  return get(id, actor);
}

/** Minimum gap between two reminders for the same invoice. */
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Emails a payment reminder for an overdue invoice. The throttle slot is claimed atomically BEFORE sending, so two staff
 * members clicking at once cannot send twice; if delivery fails the claim is released and nothing counts as sent.
 */
export async function remind(id: string, actor: Principal) {
  const existing = await db.invoice.findUnique({ where: { id }, select: { lastReminderAt: true, reminderCount: true } });
  if (!existing) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
  const today = parseDate(todayBusiness());
  const claimed = await db.invoice.updateMany({
    where: { id, status: { in: OPEN }, dueDate: { lt: today }, OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(Date.now() - REMINDER_INTERVAL_MS) } }] },
    data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    const row = await db.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
    const dto = toInvoiceDto(row);
    if (!dto.overdue) throw new AppError(409, 'CONFLICT', `Only overdue invoices can be reminded (this one is ${row.status}${row.status === 'CONFIRMED' || row.status === 'PARTIALLY_PAID' ? ', not yet past due' : ''})`);
    throw new AppError(409, 'CONFLICT', 'A reminder was already sent for this invoice in the last 24 hours');
  }
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
  const dto = toInvoiceDto(invoice);
  const daysOverdue = Math.max(1, Math.round((parseDate(todayBusiness()).getTime() - invoice.dueDate.getTime()) / 86_400_000));
  try { await invoiceMailer.send(renderReminderEmail({ number: dto.number, customerName: dto.customerName, customerEmail: dto.customerEmail, dueDate: dto.dueDate, outstanding: dto.outstanding, currency: dto.currency, daysOverdue })); } catch (error) {
    console.error('Reminder email failed', error);
    await db.invoice.update({ where: { id }, data: { lastReminderAt: existing.lastReminderAt, reminderCount: existing.reminderCount } }); // release the claim
    throw new AppError(502, 'EMAIL_FAILED', 'The reminder email could not be sent; nothing was marked as sent');
  }
  return get(id, actor);
}

// ---- bulk actions: every invoice is processed independently (its own lock/transaction); failures never block the rest.
export interface BulkResult { succeeded: number; failed: Array<{ id: string; code: string; message: string }> }
async function bulk(ids: string[], action: (id: string) => Promise<unknown>): Promise<BulkResult> {
  const result: BulkResult = { succeeded: 0, failed: [] };
  for (const id of ids) {
    try { await action(id); result.succeeded += 1; } catch (error) {
      if (error instanceof AppError) result.failed.push({ id, code: error.code, message: error.message });
      else { console.error('Bulk invoice action failed', error); result.failed.push({ id, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }); }
    }
  }
  return result;
}
export const confirmMany = (ids: string[], actor: Principal) => bulk(ids, id => confirm(id, actor));
export const sendMany = (ids: string[], actor: Principal) => bulk(ids, id => send(id, actor));
export const remindMany = (ids: string[], actor: Principal) => bulk(ids, id => remind(id, actor));

