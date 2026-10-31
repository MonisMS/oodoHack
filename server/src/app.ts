import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { allowedOrigins } from './lib/env.js';
import { originGuard } from './middleware/origin-guard.js';
import { AppError, errorHandler } from './lib/errors.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { registerModules } from './modules/index.js';
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
// Cookie sessions need CSRF defence in depth: a state-changing browser request from another origin is refused.
// It also covers /api/auth: Better Auth only checks Origin when a cookie is already present, which would leave login CSRF open.
app.use('/api', originGuard);
// Better Auth owns every /api/auth/* route and must run before the JSON body parser.
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use(express.json({ limit: '256kb' }));
app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok', scope: 'foundation' } }));
registerModules(app);
app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found')));
app.use(errorHandler);
