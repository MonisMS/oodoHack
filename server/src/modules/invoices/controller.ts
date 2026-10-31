import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// One controller serves the whole router (lib/module-router.ts); dispatch on method + route pattern.
const handlers: Record<string, RequestHandler> = {
  'GET /': async (req, res) => { res.json(await service.list(res.locals.validated.query, req.user!)); },
  'POST /confirm': async (req, res) => { res.json({ data: await service.confirmMany(res.locals.validated.body.ids, req.user!) }); },
  'POST /send': async (req, res) => { res.json({ data: await service.sendMany(res.locals.validated.body.ids, req.user!) }); },
  'POST /remind': async (req, res) => { res.json({ data: await service.remindMany(res.locals.validated.body.ids, req.user!) }); },
  'POST /:id/remind': async (req, res) => { res.json({ data: await service.remind(res.locals.validated.params.id, req.user!) }); },
  'GET /:id': async (req, res) => { res.json({ data: await service.get(res.locals.validated.params.id, req.user!) }); },
  'POST /:id/confirm': async (req, res) => { res.json({ data: await service.confirm(res.locals.validated.params.id, req.user!) }); },
  'POST /:id/cancel': async (req, res) => { res.json({ data: await service.cancel(res.locals.validated.params.id, req.user!) }); },
  'POST /:id/send': async (req, res) => { res.json({ data: await service.send(res.locals.validated.params.id, req.user!) }); },
};

export const controller: RequestHandler = (req, res, next) => {
  const handler = handlers[`${req.method} ${req.route.path}`];
  if (!handler) return next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
  return handler(req, res, next);
};
