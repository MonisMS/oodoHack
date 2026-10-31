import type { RequestHandler } from 'express';
import { allowedOrigins } from '../lib/env.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Browsers always send Origin on cross-site POST/PUT/DELETE. A request whose Origin is not one of ours is refused,
// so a malicious page cannot ride a signed-in user's session cookie. Requests with no Origin (curl, server-to-server,
// tests) are not browser CSRF vectors and are left to normal authentication.
export const originGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.header('origin');
  if (origin && !allowedOrigins.includes(origin)) return next(new AppError(403, 'FORBIDDEN', 'Cross-origin request blocked'));
  next();
};
