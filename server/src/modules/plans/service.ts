import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { lockCatalogRow as lockRow } from "../../lib/catalog-admin.js";
import {
  assertTaxIds,
  catalogOrder,
  catalogDate,
  literalSearch,
  databaseInt,
  type CatalogQuery,
} from "../../lib/catalog-admin.js";
import { dateOnly } from "../../lib/dates.js";
import type { Principal } from "../../middleware/auth.js";
import type { planInput } from "./schemas.js";
type Input = z.infer<typeof planInput>;
const include = {
  taxes: { select: { id: true } },
} satisfies Prisma.PlanInclude;
type Row = Prisma.PlanGetPayload<{ include: typeof include }>;
export const toPlanDto = (p: Row) => ({
  id: p.id,
  name: p.name,
  price: p.price.toFixed(2),
  billingPeriod: p.billingPeriod,
  minQuantity: p.minQuantity,
  availableFrom: p.availableFrom ? dateOnly(p.availableFrom) : null,
  availableTo: p.availableTo ? dateOnly(p.availableTo) : null,
  autoClose: p.autoClose,
  closableEarly: p.closableEarly,
  pausable: p.pausable,
  renewable: p.renewable,
  isActive: p.isActive,
  taxIds: p.taxes.map((t) => t.id),
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
export async function list(q: CatalogQuery, _actor: Principal) {
  const where: Prisma.PlanWhereInput = q.search
    ? { name: { contains: literalSearch(q.search), mode: "insensitive" } }
    : {};
  const orderBy = catalogOrder(q);
  const [rows, total] = await db.$transaction([
    db.plan.findMany({
      where,
      include,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.plan.count({ where }),
  ]);
  return {
    data: rows.map(toPlanDto),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}
export async function get(id: string, _actor: Principal) {
  const row = await db.plan.findUnique({ where: { id }, include });
  if (!row) throw new AppError(404, "NOT_FOUND", "Plan not found");
  return toPlanDto(row);
}
function dataFor(input: Input) {
  databaseInt(input.minQuantity, "minQuantity");
  const { taxIds, availableFrom, availableTo, ...data } = input;
  return {
    ...data,
    availableFrom: availableFrom
      ? catalogDate(availableFrom, "availableFrom")
      : null,
    availableTo: availableTo ? catalogDate(availableTo, "availableTo") : null,
    taxes: { set: taxIds.map((id) => ({ id })) },
  };
}
export async function create(input: Input, actor: Principal) {
  const id = await db.$transaction(async (tx) => {
    await assertTaxIds(tx, input.taxIds);
    const { taxes, ...data } = dataFor(input);
    return (
      await tx.plan.create({
        data: { ...data, taxes: { connect: taxes.set } },
        select: { id: true },
      })
    ).id;
  });
  return get(id, actor);
}
export async function replace(id: string, input: Input, actor: Principal) {
  await db.$transaction(async (tx) => {
    await lockRow(tx, "Plan", id, "Plan not found");
    await assertTaxIds(tx, input.taxIds);
    await tx.plan.update({ where: { id }, data: dataFor(input) });
  });
  return get(id, actor);
}
export async function remove(id: string, _actor: Principal) {
  await db.plan.update({ where: { id }, data: { isActive: false } });
}
