import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { lockCatalogRow as lockRow } from "../../lib/catalog-admin.js";
import {
  assertTaxIds,
  catalogOrder,
  literalSearch,
  type CatalogQuery,
} from "../../lib/catalog-admin.js";
import type { Principal } from "../../middleware/auth.js";
import type { productInput, variantInput } from "./schemas.js";
type Input = z.infer<typeof productInput>;
type VariantInput = z.infer<typeof variantInput>;
const include = {
  taxes: { select: { id: true } },
  variants: {
    orderBy: [{ attribute: "asc" }, { value: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ProductInclude;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof include }>;
export const toVariantDto = (v: Prisma.ProductVariantGetPayload<object>) => ({
  id: v.id,
  productId: v.productId,
  attribute: v.attribute,
  value: v.value,
  extraPrice: v.extraPrice.toFixed(2),
  isActive: v.isActive,
});
export const toProductDto = (p: ProductRow) => ({
  id: p.id,
  name: p.name,
  type: p.type,
  salesPrice: p.salesPrice.toFixed(2),
  costPrice: p.costPrice.toFixed(2),
  notes: p.notes,
  isActive: p.isActive,
  taxIds: p.taxes.map((t) => t.id),
  variants: p.variants.map(toVariantDto),
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
export async function list(q: CatalogQuery, _actor: Principal) {
  const where: Prisma.ProductWhereInput = q.search
    ? { name: { contains: literalSearch(q.search), mode: "insensitive" } }
    : {};
  const orderBy = catalogOrder(q);
  const [rows, total] = await db.$transaction([
    db.product.findMany({
      where,
      include,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.product.count({ where }),
  ]);
  return {
    data: rows.map(toProductDto),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}
export async function get(id: string, _actor: Principal) {
  const row = await db.product.findUnique({ where: { id }, include });
  if (!row) throw new AppError(404, "NOT_FOUND", "Product not found");
  return toProductDto(row);
}
export async function create(input: Input, actor: Principal) {
  const { taxIds, ...data } = input;
  const id = await db.$transaction(async (tx) => {
    await assertTaxIds(tx, taxIds);
    return (
      await tx.product.create({
        data: {
          ...data,
          notes: data.notes ?? null,
          taxes: { connect: taxIds.map((id) => ({ id })) },
        },
        select: { id: true },
      })
    ).id;
  });
  return get(id, actor);
}
export async function replace(id: string, input: Input, actor: Principal) {
  const { taxIds, ...data } = input;
  await db.$transaction(async (tx) => {
    await lockRow(tx, "Product", id, "Product not found");
    await assertTaxIds(tx, taxIds);
    await tx.product.update({
      where: { id },
      data: {
        ...data,
        notes: data.notes ?? null,
        taxes: { set: taxIds.map((id) => ({ id })) },
      },
    });
  });
  return get(id, actor);
}
export async function remove(id: string, _actor: Principal) {
  await db.product.update({ where: { id }, data: { isActive: false } });
}
export async function createVariant(
  id: string,
  input: VariantInput,
  _actor: Principal,
) {
  return db.$transaction(async (tx) => {
    await lockRow(tx, "Product", id, "Product not found");
    if ((await tx.productVariant.count({ where: { productId: id } })) >= 100)
      throw new AppError(
        409,
        "LIMIT_REACHED",
        "A product can contain at most 100 variants",
      );
    return toVariantDto(
      await tx.productVariant.create({ data: { ...input, productId: id } }),
    );
  });
}
export async function replaceVariant(
  id: string,
  variantId: string,
  input: VariantInput,
  _actor: Principal,
) {
  return db.$transaction(async (tx) => {
    await lockRow(tx, "Product", id, "Product not found");
    const row = await tx.productVariant.findFirst({
      where: { id: variantId, productId: id },
    });
    if (!row)
      throw new AppError(
        404,
        "NOT_FOUND",
        "Variant not found for this product",
      );
    return toVariantDto(
      await tx.productVariant.update({ where: { id: variantId }, data: input }),
    );
  });
}
export async function removeVariant(
  id: string,
  variantId: string,
  _actor: Principal,
) {
  await db.$transaction(async (tx) => {
    await lockRow(tx, "Product", id, "Product not found");
    const result = await tx.productVariant.updateMany({
      where: { id: variantId, productId: id },
      data: { isActive: false },
    });
    if (!result.count)
      throw new AppError(
        404,
        "NOT_FOUND",
        "Variant not found for this product",
      );
  });
}
