import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// One controller serves the whole router (lib/module-router.ts); dispatch on method + route pattern.
const handlers: Record<string, RequestHandler> = {
  'GET /': async (req, res) => { res.json(await service.list(res.locals.validated.query, req.user!)); },
  'POST /': async (req, res) => { res.status(201).json({ data: await service.recordPayment(res.locals.validated.body, req.user!) }); },
};

export const controller: RequestHandler = (req, res, next) => {
  const handler = handlers[`${req.method} ${req.route.path}`];
  if (!handler) return next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
  return handler(req, res, next);
};
