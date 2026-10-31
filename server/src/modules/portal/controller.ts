import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// One controller serves the whole router (lib/module-router.ts); dispatch on method + route pattern.
// The customer is ALWAYS taken from the authenticated principal (req.user), never from the request.
const handlers: Record<string, RequestHandler> = {
  'GET /summary': async (req, res) => { res.json({ data: await service.summary(req.user!) }); },
  'GET /subscriptions': async (req, res) => { res.json(await service.listSubscriptions(res.locals.validated.query, req.user!)); },
  'GET /subscriptions/:id': async (req, res) => { res.json({ data: await service.getSubscription(res.locals.validated.params.id, req.user!) }); },
  'POST /subscriptions/:id/cancel-at-period-end': async (req, res) => { res.json({ data: await service.cancelAtPeriodEnd(res.locals.validated.params.id, res.locals.validated.body, req.user!) }); },
  'POST /subscriptions/:id/keep': async (req, res) => { res.json({ data: await service.keepSubscription(res.locals.validated.params.id, res.locals.validated.body, req.user!) }); },
  'GET /invoices': async (req, res) => { res.json(await service.listInvoices(res.locals.validated.query, req.user!)); },
  'GET /invoices/:id': async (req, res) => { res.json({ data: await service.getInvoice(res.locals.validated.params.id, req.user!) }); },
};

export const controller: RequestHandler = (req, res, next) => {
  const handler = handlers[`${req.method} ${req.route.path}`];
  if (!handler) return next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
  return handler(req, res, next);
};
