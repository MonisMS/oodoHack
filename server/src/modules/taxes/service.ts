import { Prisma, type Plan, type Product, type Tax } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import type { Principal } from '../../middleware/auth.js';
import type { listQuery, taxInput } from './schemas.js';

type ListQuery = z.infer<typeof listQuery>;
type TaxInput = z.infer<typeof taxInput>;

const include = { products: { select: { id: true } }, plans: { select: { id: true } } } satisfies Prisma.TaxInclude;
type Row = Tax & { products: Pick<Product, 'id'>[]; plans: Pick<Plan, 'id'>[] };

// Wire shape of the contract's Tax. percentage is a plain decimal string without trailing zeros ("18", "12.5").
export function toTaxDto(t: Row) {
  return {
    id: t.id, name: t.name, percentage: t.percentage.toString(), isActive: t.isActive,
    productIds: t.products.map(p => p.id).sort(), planIds: t.plans.map(p => p.id).sort(),
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
  };
}

// Tax names are unique; report that as a readable field error instead of a bare database conflict.
function conflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'CONFLICT', 'A tax with this name already exists', { name: ['A tax with this name already exists'] });
  throw error;
}

async function assertRelations(tx: Prisma.TransactionClient, input: TaxInput) {
  const fields: Record<string, string[]> = {};
  if (input.productIds.length && (await tx.product.count({ where: { id: { in: input.productIds } } })) !== input.productIds.length) fields.productIds = ['One or more products do not exist'];
  if (input.planIds.length && (await tx.plan.count({ where: { id: { in: input.planIds } } })) !== input.planIds.length) fields.planIds = ['One or more plans do not exist'];
  if (Object.keys(fields).length) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', fields);
}

export async function list(q: ListQuery, _actor: Principal) {
  const where: Prisma.TaxWhereInput = q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {};
  const sortBy = q.sortBy === 'name' ? 'name' : 'createdAt';
  const [rows, total] = await Promise.all([
    db.tax.findMany({ where, include, orderBy: [{ [sortBy]: q.sortOrder }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.tax.count({ where }),
  ]);
  return { data: rows.map(toTaxDto), page: q.page, pageSize: q.pageSize, total };
}

export async function get(id: string, _actor: Principal) {
  const row = await db.tax.findUnique({ where: { id }, include });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Tax not found');
  return toTaxDto(row);
}

export async function create(input: TaxInput, actor: Principal) {
  try {
    const id = await db.$transaction(async tx => {
      await assertRelations(tx, input);
      const tax = await tx.tax.create({ data: { name: input.name, percentage: input.percentage, isActive: input.isActive, products: { connect: input.productIds.map(id => ({ id })) }, plans: { connect: input.planIds.map(id => ({ id })) } }, select: { id: true } });
      return tax.id;
    });
    return get(id, actor);
  } catch (error) { return conflict(error); }
}

export async function replace(id: string, input: TaxInput, actor: Principal) {
  try {
    await db.$transaction(async tx => {
      if (!(await tx.tax.findUnique({ where: { id }, select: { id: true } }))) throw new AppError(404, 'NOT_FOUND', 'Tax not found');
      await assertRelations(tx, input);
      await tx.tax.update({ where: { id }, data: { name: input.name, percentage: input.percentage, isActive: input.isActive, products: { set: input.productIds.map(id => ({ id })) }, plans: { set: input.planIds.map(id => ({ id })) } } });
    });
    return get(id, actor);
  } catch (error) { return conflict(error); }
}

// DELETE deactivates: invoices keep frozen tax snapshots and products/plans keep their links for history.
export async function remove(id: string, _actor: Principal) {
  const result = await db.tax.updateMany({ where: { id }, data: { isActive: false } });
  if (result.count === 0) throw new AppError(404, 'NOT_FOUND', 'Tax not found');
}
