import type { Prisma, QuotationTemplate, QuotationTemplateLine } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { resolveLines } from '../../lib/catalog-lines.js';
import type { Principal } from '../../middleware/auth.js';
import type { listQuery, templateInput } from './schemas.js';

type ListQuery = z.infer<typeof listQuery>;
type TemplateInput = z.infer<typeof templateInput>;

const include = { lines: { orderBy: { position: 'asc' } }, plan: { select: { name: true } } } satisfies Prisma.QuotationTemplateInclude;
type Row = QuotationTemplate & { lines: QuotationTemplateLine[]; plan: { name: string } };

// Wire shape of the contract's QuotationTemplate; unitPrice null = inherits the current catalog price.
export function toTemplateDto(t: Row) {
  return {
    id: t.id, name: t.name, planId: t.planId, planName: t.plan.name, validityDays: t.validityDays, isActive: t.isActive,
    lines: t.lines.map(l => ({ id: l.id, templateId: l.templateId, productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice ? l.unitPrice.toFixed(2) : null, position: l.position })),
    createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
  };
}

async function writeLines(tx: Prisma.TransactionClient, templateId: string, input: TemplateInput) {
  const resolved = await resolveLines(tx, input.lines, 'inherit');
  await tx.quotationTemplateLine.createMany({ data: resolved.map((l, position) => ({ templateId, productId: l.productId, variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice, position })) });
}

// Templates only need an active plan; availability and minimum quantity are checked when a subscription is created.
async function assertPlanActive(tx: Prisma.TransactionClient, planId: string) {
  const plan = await tx.plan.findUnique({ where: { id: planId }, select: { isActive: true } });
  if (!plan?.isActive) throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', { planId: ['Plan not found or inactive'] });
}

export async function list(q: ListQuery, _actor: Principal) {
  const where: Prisma.QuotationTemplateWhereInput = q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {};
  const sortBy = q.sortBy === 'name' ? 'name' : 'createdAt';
  const [rows, total] = await Promise.all([
    db.quotationTemplate.findMany({ where, include, orderBy: [{ [sortBy]: q.sortOrder }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.quotationTemplate.count({ where }),
  ]);
  return { data: rows.map(toTemplateDto), page: q.page, pageSize: q.pageSize, total };
}

export async function get(id: string, _actor: Principal) {
  const row = await db.quotationTemplate.findUnique({ where: { id }, include });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Quotation template not found');
  return toTemplateDto(row);
}

export async function create(input: TemplateInput, _actor: Principal) {
  const id = await db.$transaction(async tx => {
    await assertPlanActive(tx, input.planId);
    const template = await tx.quotationTemplate.create({ data: { name: input.name, planId: input.planId, validityDays: input.validityDays, isActive: input.isActive } });
    await writeLines(tx, template.id, input);
    return template.id;
  });
  return get(id, _actor);
}

export async function replace(id: string, input: TemplateInput, actor: Principal) {
  await db.$transaction(async tx => {
    if (!(await tx.quotationTemplate.findUnique({ where: { id }, select: { id: true } }))) throw new AppError(404, 'NOT_FOUND', 'Quotation template not found');
    await assertPlanActive(tx, input.planId);
    await tx.quotationTemplate.update({ where: { id }, data: { name: input.name, planId: input.planId, validityDays: input.validityDays, isActive: input.isActive } });
    await tx.quotationTemplateLine.deleteMany({ where: { templateId: id } });
    await writeLines(tx, id, input);
  });
  return get(id, actor);
}

// DELETE deactivates; subscriptions created from the template are unaffected (their lines are independent copies).
export async function remove(id: string, _actor: Principal) {
  const result = await db.quotationTemplate.updateMany({ where: { id }, data: { isActive: false } });
  if (result.count === 0) throw new AppError(404, 'NOT_FOUND', 'Quotation template not found');
}
