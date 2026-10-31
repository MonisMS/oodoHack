import type { Prisma, Role, User as UserRow } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { createCredentialUser } from '../../lib/auth.js';
import type { z } from 'zod';
import type { Principal } from '../../middleware/auth.js';
import type { listQuery, staffInput, userUpdateInput } from './schemas.js';

type ListQuery = z.infer<typeof listQuery>;
type StaffInput = z.infer<typeof staffInput>;
type UserUpdateInput = z.infer<typeof userUpdateInput>;

// Wire shape of the contract's User: never expose hashes, tokens or provider data.
export function toUserDto(u: Pick<UserRow, 'id' | 'name' | 'email' | 'role' | 'isActive' | 'createdAt'>) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt.toISOString() };
}

async function listByRole(roles: Role[], q: ListQuery) {
  const where: Prisma.UserWhereInput = { role: { in: roles } };
  // Prisma's `contains` escapes LIKE metacharacters, so search is a literal substring match.
  if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }];
  const sortBy = q.sortBy === 'name' ? 'name' : 'createdAt';
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, orderBy: [{ [sortBy]: q.sortOrder }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.user.count({ where }),
  ]);
  return { data: rows.map(toUserDto), page: q.page, pageSize: q.pageSize, total };
}

// Public service exports follow the contract: every export takes the acting principal (routes also guard roles).
export const listCustomers = (q: ListQuery, _actor: Principal) => listByRole(['CUSTOMER'], q);
export const listStaff = (q: ListQuery, _actor: Principal) => listByRole(['STAFF', 'ADMIN'], q);

/** ADMIN-only (enforced by the route). The new account is always STAFF. */
export async function createStaff(input: StaffInput, _actor: Principal) {
  const email = input.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError(409, 'CONFLICT', 'An account with this email already exists');
  try {
    const user = await createCredentialUser({ name: input.name, email, password: input.password, role: 'STAFF' });
    return toUserDto(await db.user.findUniqueOrThrow({ where: { id: user.id } }));
  } catch (error) {
    // Lost a race with a concurrent signup of the same email.
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') throw new AppError(409, 'CONFLICT', 'An account with this email already exists');
    throw error;
  }
}

/**
 * ADMIN-only. Renames or (de)activates a STAFF or CUSTOMER account; administrator accounts are never editable here,
 * which also means nobody can lock the last admin out. Deactivation revokes every session immediately.
 * A customer who still has ACTIVE or PAUSED subscriptions cannot be deactivated (billing would keep invoicing them).
 */
export async function updateUser(id: string, input: UserUpdateInput, _actor: Principal) {
  const user = await db.$transaction(async tx => {
    const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true, isActive: true } });
    if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (target.role === 'ADMIN') throw new AppError(409, 'CONFLICT', 'Administrator accounts cannot be changed here');
    if (input.isActive === false && target.role === 'CUSTOMER') {
      const live = await tx.subscription.count({ where: { customerId: id, status: { in: ['ACTIVE', 'PAUSED'] } } });
      if (live > 0) throw new AppError(409, 'CONFLICT', 'Close the active and paused subscriptions of this customer before deactivating the account');
    }
    const updated = await tx.user.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) } });
    if (input.isActive === false) await tx.session.deleteMany({ where: { userId: id } });
    return updated;
  });
  return toUserDto(user);
}
