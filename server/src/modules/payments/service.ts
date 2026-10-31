import { Prisma, type Payment as PaymentRow } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { dateOnly, parseDate, todayUtc } from '../../lib/dates.js';
import { lockRow } from '../../lib/locks.js';
import type { Principal } from '../../middleware/auth.js';
import type { paymentInput, paymentQuery } from './schemas.js';

type Query = z.infer<typeof paymentQuery>;
type Input = z.infer<typeof paymentInput>;

// Wire shape of the contract's Payment.
export function toPaymentDto(p: PaymentRow) {
  return { id: p.id, invoiceId: p.invoiceId, method: p.method, amount: p.amount.toFixed(2), date: dateOnly(p.date), note: p.note, recordedById: p.recordedById, createdAt: p.createdAt.toISOString() };
}

export async function list(q: Query, _actor: Principal) {
  if (q.from && q.to && q.from > q.to) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { to: ['Must be on or after from'] });
  const where: Prisma.PaymentWhereInput = {};
  if (q.invoiceId) where.invoiceId = q.invoiceId;
  if (q.method) where.method = q.method;
  if (q.from || q.to) where.date = { ...(q.from ? { gte: parseDate(q.from) } : {}), ...(q.to ? { lte: parseDate(q.to) } : {}) };
  const invoice: Prisma.InvoiceWhereInput = {};
  if (q.customerId) invoice.customerId = q.customerId;
  if (q.search) invoice.OR = [{ number: { contains: q.search, mode: 'insensitive' } }, { customerName: { contains: q.search, mode: 'insensitive' } }];
  if (Object.keys(invoice).length) where.invoice = invoice;
  const dir = q.sortOrder;
  const orderBy: Prisma.PaymentOrderByWithRelationInput = q.sortBy === 'date' ? { date: dir } : { createdAt: dir };
  const [rows, total] = await Promise.all([
    db.payment.findMany({ where, orderBy: [orderBy, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.payment.count({ where }),
  ]);
  return { data: rows.map(toPaymentDto), page: q.page, pageSize: q.pageSize, total };
}

/**
 * Records a payment against a CONFIRMED / PARTIALLY_PAID invoice. The invoice row is locked, payments are
 * re-aggregated under the lock (never trusting a cached amountPaid), and the payment plus the invoice's
 * amountPaid/status change commit atomically. Payments cannot be edited or deleted in v1.
 */
export async function recordPayment(input: Input, actor: Principal) {
  const row = await db.$transaction(async tx => {
    await lockRow(tx, 'Invoice', input.invoiceId, 'Invoice not found');
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId }, select: { status: true, total: true } });
    if (invoice.status !== 'CONFIRMED' && invoice.status !== 'PARTIALLY_PAID') throw new AppError(409, 'CONFLICT', `Payments can only be recorded against CONFIRMED or PARTIALLY_PAID invoices (this one is ${invoice.status})`);
    if (input.date > todayUtc()) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { date: ['Payment date cannot be in the future'] });
    const paid = (await tx.payment.aggregate({ where: { invoiceId: input.invoiceId }, _sum: { amount: true } }))._sum.amount ?? new Prisma.Decimal(0);
    const amount = new Prisma.Decimal(input.amount);
    const outstanding = invoice.total.minus(paid);
    if (amount.gt(outstanding)) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { amount: [`Amount exceeds the outstanding balance of ${outstanding.toFixed(2)}`] });
    const payment = await tx.payment.create({ data: { invoiceId: input.invoiceId, recordedById: actor.id, method: input.method, amount, date: parseDate(input.date), note: input.note ?? null } });
    const newPaid = paid.plus(amount);
    await tx.invoice.update({ where: { id: input.invoiceId }, data: { amountPaid: newPaid, status: newPaid.gte(invoice.total) ? 'PAID' : 'PARTIALLY_PAID' } });
    return payment;
  });
  return toPaymentDto(row);
}
