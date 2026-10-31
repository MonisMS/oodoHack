import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';
// Owner B: replace with controllers using res.locals.validated.
export const controller: RequestHandler = (_req, _res, next) => next(new AppError(501, 'NOT_IMPLEMENTED', 'plans is awaiting its assigned workstream'));
