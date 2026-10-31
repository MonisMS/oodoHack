import 'dotenv/config';
import { z } from 'zod';
const flag = z.enum(['true','false']).default('false').transform(v => v === 'true');
export const env = z.object({ NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().min(1).max(65535).default(4000), CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'), DEV_AUTH_ENABLED: flag, BILLING_CRON_ENABLED: flag }).parse(process.env);
if (env.NODE_ENV === 'production' && env.DEV_AUTH_ENABLED) throw new Error('DEV_AUTH_ENABLED must be false in production');
if (env.BILLING_CRON_ENABLED) throw new Error('Billing scheduler is not implemented yet; leave BILLING_CRON_ENABLED=false until Person A wires the real billing service');
