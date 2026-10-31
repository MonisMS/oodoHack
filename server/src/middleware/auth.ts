import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { fromNodeHeaders } from 'better-auth/node';
import { env } from '../lib/env.js';
import { id, role } from '../lib/contracts.js';
import { AppError } from '../lib/errors.js';
import { auth } from '../lib/auth.js';
export interface Principal { id: string; role: Role }
declare global { namespace Express { interface Request { user?: Principal } } }
// Real authentication: Better Auth cookie session, then an active-user check on every request.
// DEV_AUTH_ENABLED keeps the old x-dev-* headers as an opt-in fallback only when there is no session.
// It is refused in production (see lib/env.ts) and is removed at A-08.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session) {
      const user = session.user as { id: string; role: unknown; isActive?: boolean };
      const parsedRole = role.safeParse(user.role);
      if (user.isActive === false || !parsedRole.success) return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
      req.user = { id: user.id, role: parsedRole.data }; return next();
    }
    if (!env.DEV_AUTH_ENABLED || env.NODE_ENV === 'production') return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
    const userId = id.safeParse(req.header('x-dev-user-id'));
    const userRole = role.safeParse(req.header('x-dev-role'));
    if (!userId.success || !userRole.success) return next(new AppError(401, 'UNAUTHENTICATED', 'Supply valid development identity headers'));
    req.user = { id: userId.data, role: userRole.data }; next();
  } catch (error) { next(error); }
};
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, 'FORBIDDEN', 'Your role cannot perform this action'));
    next();
  };
}
