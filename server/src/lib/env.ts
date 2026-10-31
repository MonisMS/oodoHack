import 'dotenv/config';
import { z } from 'zod';
// Development-only fallback so a fresh clone boots; production refuses it below.
const DEV_SECRET = 'dev-only-better-auth-secret-change-me-0000';
const flag = z.enum(['true','false']).default('false').transform(v => v === 'true');
export const env = z.object({ NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().min(1).max(65535).default(4000), CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'), DEV_AUTH_ENABLED: flag, BETTER_AUTH_URL: z.string().url().default('http://localhost:4000'), BETTER_AUTH_SECRET: z.string().min(32).default(DEV_SECRET), BILLING_CRON_ENABLED: flag }).parse(process.env);
if (env.NODE_ENV === 'production' && env.DEV_AUTH_ENABLED) throw new Error('DEV_AUTH_ENABLED must be false in production');
if (env.BILLING_CRON_ENABLED) throw new Error('Billing scheduler is not implemented yet; leave BILLING_CRON_ENABLED=false until Person A wires the real billing service');
if (env.NODE_ENV === 'production' && env.BETTER_AUTH_SECRET === DEV_SECRET) throw new Error('Set BETTER_AUTH_SECRET to a random value of 32+ characters in production');
