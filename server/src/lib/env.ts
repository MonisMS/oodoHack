import 'dotenv/config';
import { z } from 'zod';
// Development-only fallback so a fresh clone boots; production refuses it below.
const DEV_SECRET = 'dev-only-better-auth-secret-change-me-0000';
const flag = z.enum(['true','false']).default('false').transform(v => v === 'true');
export const env = z.object({ NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().int().min(1).max(65535).default(4000), CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'), DEV_AUTH_ENABLED: flag, HOST: z.string().min(1).default('127.0.0.1'), TRUST_PROXY: flag, BUSINESS_TZ: z.string().default('Asia/Kolkata').refine(tz => { try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; } catch { return false; } }, 'BUSINESS_TZ must be a valid IANA time zone'), BETTER_AUTH_URL: z.string().url().default('http://localhost:4000'), BETTER_AUTH_SECRET: z.string().min(32).default(DEV_SECRET), BILLING_CRON_ENABLED: flag, BILLING_CRON: z.string().min(1).default('0 0 * * *') }).parse(process.env);
if (env.NODE_ENV === 'production' && env.DEV_AUTH_ENABLED) throw new Error('DEV_AUTH_ENABLED must be false in production');
if (env.NODE_ENV === 'production' && env.BETTER_AUTH_SECRET === DEV_SECRET) throw new Error('Set BETTER_AUTH_SECRET to a random value of 32+ characters in production');

// Browser origins allowed to call the API with credentials. In development `localhost` and `127.0.0.1` are interchangeable
// (Vite binds 127.0.0.1); production allows exactly CLIENT_ORIGIN.
const swapLoopback = (origin: string) => origin.includes('//localhost') ? origin.replace('//localhost', '//127.0.0.1') : origin.replace('//127.0.0.1', '//localhost');
export const allowedOrigins = [...new Set([env.CLIENT_ORIGIN, ...(env.NODE_ENV === 'production' ? [] : [swapLoopback(env.CLIENT_ORIGIN)])])];

// Auth rate limiting is on everywhere except tests (which sign in constantly); AUTH_RATE_LIMIT=true|false overrides.
export const authRateLimitEnabled = process.env.AUTH_RATE_LIMIT ? process.env.AUTH_RATE_LIMIT === 'true' : env.NODE_ENV !== 'test';

