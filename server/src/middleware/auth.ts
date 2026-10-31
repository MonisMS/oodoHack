import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { env } from '../lib/env.js';
import { id, role } from '../lib/contracts.js';
import { AppError } from '../lib/errors.js';
export interface Principal { id: string; role: Role }
declare global { namespace Express { interface Request { user?: Principal } } }
// TEMPORARY DEVELOPMENT ADAPTER. C replaces this file, preserving both signatures.
// No JWT acceptance until C implements token verification + active-user lookup.
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!env.DEV_AUTH_ENABLED || env.NODE_ENV === 'production') return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
  const userId = id.safeParse(req.header('x-dev-user-id'));
  const userRole = role.safeParse(req.header('x-dev-role'));
  if (!userId.success || !userRole.success) return next(new AppError(401, 'UNAUTHENTICATED', 'Supply valid development identity headers'));
  req.user = { id: userId.data, role: userRole.data }; next();
};
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, 'FORBIDDEN', 'Your role cannot perform this action'));
    next();
  };
}
