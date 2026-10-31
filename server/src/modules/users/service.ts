import type { Prisma, Role, User as UserRow } from '@prisma/client';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { createCredentialUser } from '../../lib/auth.js';
import type { z } from 'zod';
import type { listQuery, staffInput } from './schemas.js';

type ListQuery = z.infer<typeof listQuery>;
type StaffInput = z.infer<typeof staffInput>;

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

export const listCustomers = (q: ListQuery) => listByRole(['CUSTOMER'], q);
export const listStaff = (q: ListQuery) => listByRole(['STAFF', 'ADMIN'], q);

/** ADMIN-only (enforced by the route). The new account is always STAFF. */
export async function createStaff(input: StaffInput) {
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
