import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';
import * as service from './service.js';

// One controller serves the whole router (lib/module-router.ts); dispatch on method + route pattern.
// Input has already been validated into res.locals.validated by the route's schemas.
const handlers: Record<string, RequestHandler> = {
  'GET /': async (req, res) => { res.json(await service.list(res.locals.validated.query, req.user!)); },
  'POST /': async (req, res) => { res.status(201).json({ data: await service.create(res.locals.validated.body, req.user!) }); },
  'POST /from-template': async (req, res) => { res.status(201).json({ data: await service.createFromTemplate(res.locals.validated.body, req.user!) }); },
  'GET /:id': async (req, res) => { res.json({ data: await service.get(res.locals.validated.params.id, req.user!) }); },
  'PUT /:id': async (req, res) => { res.json({ data: await service.replace(res.locals.validated.params.id, res.locals.validated.body, req.user!) }); },
  'DELETE /:id': async (req, res) => { await service.remove(res.locals.validated.params.id, req.user!); res.status(204).end(); },
  'POST /:id/schedule-cancellation': async (req, res) => { res.json({ data: await service.scheduleCancellation(res.locals.validated.params.id, res.locals.validated.body, req.user!) }); },
  'POST /:id/unschedule-cancellation': async (req, res) => { res.json({ data: await service.unscheduleCancellation(res.locals.validated.params.id, res.locals.validated.body, req.user!) }); },
  'POST /:id/change-lines': async (req, res) => { res.json({ data: await service.changeLines(res.locals.validated.params.id, res.locals.validated.body, req.user!) }); },
  'POST /:id/transition': async (req, res) => { res.json({ data: await service.transition(res.locals.validated.params.id, res.locals.validated.body, req.user!) }); },
};

export const controller: RequestHandler = (req, res, next) => {
  const handler = handlers[`${req.method} ${req.route.path}`];
  if (!handler) return next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
  return handler(req, res, next);
};
