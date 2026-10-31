import { Prisma } from '@prisma/client';
import { AppError } from './errors.js';

type Tx = Prisma.TransactionClient;
// Table names cannot be bound as SQL parameters, so only these whitelisted literals are ever interpolated.
const TABLES = { Subscription: Prisma.raw('"Subscription"'), Invoice: Prisma.raw('"Invoice"') } as const;

/**
 * Row-locks one record (SELECT ... FOR UPDATE) for the rest of the caller's transaction and throws 404 if it does not exist.
 * Callers must re-read the row AFTER locking so concurrent writers cannot act on stale state.
 */
export async function lockRow(tx: Tx, table: keyof typeof TABLES, id: string, notFound: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM ${TABLES[table]} WHERE id = ${id}::uuid FOR UPDATE`;
  if (rows.length === 0) throw new AppError(404, 'NOT_FOUND', notFound);
}
