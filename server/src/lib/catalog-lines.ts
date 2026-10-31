import { Prisma, type Plan } from '@prisma/client';
import { AppError } from './errors.js';

// Shared by quotation templates and subscriptions (both owned by A). Rules come from API_CONTRACT.md
// "Catalog, templates and subscription editing"; pure money/period policy lives in lib/domain (B).
export type Tx = Prisma.TransactionClient;
export interface LineIn { productId: string; variantId: string | null; quantity: number; unitPrice?: string }
export interface ResolvedLine { productId: string; variantId: string | null; description: string; quantity: number; unitPrice: string | null }

export const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
export const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const addDays = (s: string, days: number) => dateOnly(new Date(parseDate(s).getTime() + days * 86_400_000));
export const todayUtc = () => dateOnly(new Date());

function invalid(fields: Record<string, string[]>): never {
  throw new AppError(422, 'VALIDATION_ERROR', 'Check the submitted fields', fields);
}

/**
 * Validates product/variant references and resolves each line's price.
 * mode 'freeze' (subscriptions): a missing unitPrice becomes product.salesPrice + variant.extraPrice, once.
 * mode 'inherit' (templates): a missing unitPrice stays null so the template follows the current catalog price.
 * An explicit unitPrice is always the final effective price (the variant extra is never added again).
 */
export async function resolveLines(tx: Tx, lines: LineIn[], mode: 'freeze' | 'inherit'): Promise<ResolvedLine[]> {
  const productIds = [...new Set(lines.map(l => l.productId))];
  const variantIds = [...new Set(lines.flatMap(l => (l.variantId ? [l.variantId] : [])))];
  const [products, variants] = await Promise.all([
    tx.product.findMany({ where: { id: { in: productIds } } }),
    variantIds.length ? tx.productVariant.findMany({ where: { id: { in: variantIds } } }) : Promise.resolve([]),
  ]);
  const productById = new Map(products.map(p => [p.id, p]));
  const variantById = new Map(variants.map(v => [v.id, v]));
  const fields: Record<string, string[]> = {};
  const fail = (key: string, message: string) => { (fields[key] ??= []).push(message); };

  const resolved = lines.map((line, index): ResolvedLine => {
    const product = productById.get(line.productId);
    const variant = line.variantId ? variantById.get(line.variantId) : undefined;
    if (!product || !product.isActive) fail(`lines.${index}.productId`, 'Product not found or inactive');
    if (line.variantId && (!variant || !variant.isActive || variant.productId !== line.productId)) fail(`lines.${index}.variantId`, 'Variant not found, inactive, or not a variant of this product');
    let unitPrice: string | null = line.unitPrice ?? null;
    if (unitPrice === null && mode === 'freeze' && product) {
      const price = product.salesPrice.plus(variant?.extraPrice ?? 0);
      if (price.isNegative()) fail(`lines.${index}.unitPrice`, 'Resolved price is negative; supply an explicit unitPrice');
      unitPrice = price.toFixed(2);
    }
    const description = product ? `${product.name}${variant ? ` - ${variant.attribute}: ${variant.value}` : ''}` : '';
    return { productId: line.productId, variantId: line.variantId, description, quantity: line.quantity, unitPrice };
  });
  if (Object.keys(fields).length) invalid(fields);
  return resolved;
}

/** Plan must be active, available on the start date (inclusive) and the total quantity must meet its minimum. */
export function assertPlanSelectable(plan: Plan | null, startDate: string, quantity: number): asserts plan is Plan {
  if (!plan || !plan.isActive) invalid({ planId: ['Plan not found or inactive'] });
  const fields: Record<string, string[]> = {};
  if ((plan.availableFrom && dateOnly(plan.availableFrom) > startDate) || (plan.availableTo && dateOnly(plan.availableTo) < startDate)) fields.startDate = ['Start date is outside the plan availability window'];
  if (quantity < plan.minQuantity) fields.lines = [`Total quantity ${quantity} is below the plan minimum of ${plan.minQuantity}`];
  if (Object.keys(fields).length) invalid(fields);
}

/** Customers must be active accounts with the CUSTOMER role. */
export async function assertCustomer(tx: Tx, customerId: string) {
  const user = await tx.user.findUnique({ where: { id: customerId }, select: { role: true, isActive: true } });
  if (!user || user.role !== 'CUSTOMER' || !user.isActive) invalid({ customerId: ['Customer not found, inactive, or not a customer account'] });
}

export const totalQuantity = (lines: Array<{ quantity: number }>) => lines.reduce((sum, l) => sum + l.quantity, 0);
