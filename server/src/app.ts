import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './lib/env.js';
import { AppError, errorHandler } from './lib/errors.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { registerModules } from './modules/index.js';
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
// Better Auth owns every /api/auth/* route and must run before the JSON body parser.
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use(express.json({ limit: '256kb' }));
app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok', scope: 'foundation' } }));
registerModules(app);
app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found')));
app.use(errorHandler);
