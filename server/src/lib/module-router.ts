import { Router, type RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import type { ZodType } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
export interface Endpoint { method: 'get' | 'post' | 'put' | 'delete'; path: string; roles?: Role[]; body?: ZodType; query?: ZodType; params?: ZodType }
export function moduleRouter(endpoints: Endpoint[], controller: RequestHandler) {
  const router = Router();
  for (const e of endpoints) {
    const chain: RequestHandler[] = [];
    if (e.roles) chain.push(requireAuth, requireRole(...e.roles));
    if (e.params) chain.push(validate(e.params, 'params'));
    if (e.query) chain.push(validate(e.query, 'query'));
    if (e.body) chain.push(validate(e.body));
    router[e.method](e.path, ...chain, controller);
  }
  return router;
}
