import type { Prisma } from '@prisma/client';
// Caller MUST pass its existing transaction so a failed invoice rolls back its number.
export async function nextNumber(tx: Prisma.TransactionClient, prefix: 'SUB' | 'INV', year: number): Promise<string> {
  const counter = await tx.counter.upsert({ where: { prefix_year: { prefix, year } }, create: { prefix, year, value: 1 }, update: { value: { increment: 1 } } });
  return `${prefix}/${year}/${String(counter.value).padStart(5, '0')}`;
}
