import type { RequestHandler } from 'express';
import { AppError } from '../../lib/errors.js';
// Owner A: replace with controllers using res.locals.validated.
export const controller: RequestHandler = (_req, _res, next) => next(new AppError(501, 'NOT_IMPLEMENTED', 'billing-engine is awaiting its assigned workstream'));
