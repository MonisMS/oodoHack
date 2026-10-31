import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// One controller serves the whole router (see lib/module-router.ts); dispatch on method + path.
// Input has already been validated into res.locals.validated by the route's schemas.
const handlers: Record<string, RequestHandler> = {
  'GET /customers': async (req, res) => { res.json(await service.listCustomers(res.locals.validated.query, req.user!)); },
  'GET /staff': async (req, res) => { res.json(await service.listStaff(res.locals.validated.query, req.user!)); },
  'POST /staff': async (req, res) => { res.status(201).json({ data: await service.createStaff(res.locals.validated.body, req.user!) }); },
};

export const controller: RequestHandler = (req, res, next) => {
  const handler = handlers[`${req.method} ${req.path}`];
  if (!handler) return next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
  return handler(req, res, next);
};
