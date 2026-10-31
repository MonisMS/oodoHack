import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { db } from './db.js';
import { allowedOrigins, authRateLimitEnabled, env } from './env.js';
import { renderPasswordResetEmail, sendEmail } from './email.js';
import { password as passwordPolicy } from './contracts.js';

// Endpoints whose body carries a new password; the frozen contract policy applies to all of them.
const PASSWORD_FIELD: Record<string, string> = { '/sign-up/email': 'password', '/reset-password': 'newPassword', '/change-password': 'newPassword' };

// Password-reset email goes through the shared sender (lib/email.ts): real SMTP when configured, a dev log otherwise,
// and an honest failure in production without SMTP. Kept as an object so tests can observe/replace `send`.
export const resetMailer = {
  send: async (input: { to: string; name: string; url: string }): Promise<void> => {
    await sendEmail({ to: input.to, ...renderPasswordResetEmail({ name: input.name, url: input.url }) });
  },
};

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: allowedOrigins,
  // Slows credential stuffing and reset-email abuse. In-memory per process; use a shared store if the API is scaled out.
  rateLimit: {
    enabled: authRateLimitEnabled, window: 60, max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 8 },
      '/sign-up/email': { window: 60, max: 5 },
      '/request-password-reset': { window: 60, max: 3 },
      '/reset-password': { window: 60, max: 5 },
    },
  },
  database: prismaAdapter(db, { provider: 'postgresql' }),
  advanced: { database: { generateId: 'uuid' } },
  user: {
    additionalFields: {
      // input:false = clients can never set these; signup is always an active CUSTOMER.
      role: { type: ['ADMIN', 'STAFF', 'CUSTOMER'], required: false, defaultValue: 'CUSTOMER', input: false },
      isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
    },
  },
  session: { expiresIn: 60 * 60 * 8 },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 9,
    maxPasswordLength: 72,
    resetPasswordTokenExpiresIn: 60 * 30,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => { await resetMailer.send({ to: user.email, name: user.name, url }); },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const field = PASSWORD_FIELD[ctx.path];
      if (!field) return;
      const value = (ctx.body as Record<string, unknown> | undefined)?.[field];
      const parsed = passwordPolicy.safeParse(value);
      if (!parsed.success) throw new APIError('BAD_REQUEST', { message: parsed.error.issues[0]?.message ?? 'Password does not meet the policy', code: 'WEAK_PASSWORD' });
    }),
  },
  databaseHooks: {
    session: {
      create: {
        // Deactivated users cannot start a session.
        before: async (session) => {
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { isActive: true } });
          if (!user?.isActive) throw new APIError('FORBIDDEN', { message: 'This account is disabled', code: 'ACCOUNT_DISABLED' });
          return { data: session };
        },
      },
    },
  },
});

/**
 * Creates a user with a credential login without going through public signup.
 * Used for ADMIN-created staff and for seeding (so seeded logins hash exactly like real ones).
 * User and credential account are written in one transaction; pass `id` for fixed fixture ids.
 */
export async function createCredentialUser(input: { name: string; email: string; password: string; role: 'ADMIN' | 'STAFF' | 'CUSTOMER'; id?: string }) {
  const parsed = passwordPolicy.safeParse(input.password);
  if (!parsed.success) throw new APIError('BAD_REQUEST', { message: parsed.error.issues[0]?.message ?? 'Password does not meet the policy', code: 'WEAK_PASSWORD' });
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(input.password);
  return db.$transaction(async tx => {
    const user = await tx.user.create({ data: { ...(input.id ? { id: input.id } : {}), name: input.name, email: input.email.trim().toLowerCase(), emailVerified: true, role: input.role, isActive: true } });
    await tx.account.create({ data: { userId: user.id, providerId: 'credential', accountId: user.id, password: hash } });
    return user;
  });
}
