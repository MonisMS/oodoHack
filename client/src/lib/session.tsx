import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Role } from '../types/api';
import { setApiSession } from './api';
import { authClient } from './auth-client';

/**
 * Session interface (owner A). Auth screens (C) call these; they never talk to better-auth directly.
 *
 *   const { user, role, status, signIn, signUp, signOut, requestReset, resetPassword } = useSession();
 *
 * - status: 'loading' until the first session check finishes, then 'authenticated' | 'anonymous'.
 * - Every action resolves to { ok: true } or { ok: false, code, message } and never throws, so forms can
 *   show `message` directly. Common codes: INVALID_EMAIL_OR_PASSWORD, USER_ALREADY_EXISTS, WEAK_PASSWORD,
 *   ACCOUNT_DISABLED, INVALID_TOKEN.
 * - signUp always creates a CUSTOMER. The session is an httpOnly cookie; no token is stored in JS.
 * - `dev` / `setRole` are the development role switcher (only when VITE_DEV_AUTH_ENABLED=true and nobody is
 *   signed in). A real session always wins over the dev identity.
 */
export interface SessionUser { id: string; name: string; email: string; role: Role; isActive: boolean }
export type ActionResult = { ok: true } | { ok: false; code: string; message: string };
type Status = 'loading' | 'authenticated' | 'anonymous';
interface SessionValue {
  user: SessionUser | null; role: Role | null; status: Status;
  dev: boolean; setRole: (role: Role) => void;
  signIn: (input: { email: string; password: string }) => Promise<ActionResult>;
  signUp: (input: { name: string; email: string; password: string }) => Promise<ActionResult>;
  signOut: () => Promise<ActionResult>;
  requestReset: (input: { email: string }) => Promise<ActionResult>;
  resetPassword: (input: { token: string; password: string }) => Promise<ActionResult>;
}

const devEnabled = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_ENABLED === 'true';
// Stable development identity only. Does not claim to exist in the database.
const DEV_ID = '00000000-0000-4000-8000-000000000001';
const noop = async (): Promise<ActionResult> => ({ ok: false, code: 'NO_PROVIDER', message: 'Session provider missing' });
const Session = createContext<SessionValue>({ user: null, role: null, status: 'anonymous', dev: devEnabled, setRole: () => {}, signIn: noop, signUp: noop, signOut: noop, requestReset: noop, resetPassword: noop });

type AuthResponse = { error?: { code?: string; message?: string; status?: number } | null };
async function run(call: () => Promise<AuthResponse>): Promise<ActionResult> {
  try {
    const { error } = await call();
    return error ? { ok: false, code: error.code || 'AUTH_ERROR', message: error.message || 'Request failed' } : { ok: true };
  } catch { return { ok: false, code: 'NETWORK_ERROR', message: 'Could not reach the server. Try again.' }; }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const [devRole, setDevRole] = useState<Role>('ADMIN');
  // A deactivated account is treated as signed out even if its cookie has not been revoked yet.
  const user = data?.user && data.user.isActive !== false ? { id: data.user.id, name: data.user.name, email: data.user.email, role: data.user.role as Role, isActive: data.user.isActive } : null;
  const useDev = devEnabled && !user && !isPending;
  const role = user ? user.role : useDev ? devRole : null;
  setApiSession(useDev ? { role: devRole, id: DEV_ID } : {});
  const value: SessionValue = {
    user, role, status: isPending ? 'loading' : user ? 'authenticated' : 'anonymous',
    dev: useDev, setRole: next => { if (useDev) setDevRole(next); },
    signIn: ({ email, password }) => run(() => authClient.signIn.email({ email, password })),
    signUp: ({ name, email, password }) => run(() => authClient.signUp.email({ name, email, password })),
    signOut: () => run(() => authClient.signOut()),
    requestReset: ({ email }) => run(() => authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` })),
    resetPassword: ({ token, password }) => run(() => authClient.resetPassword({ token, newPassword: password })),
  };
  return <Session.Provider value={value}>{children}</Session.Provider>;
}
export const useSession = () => useContext(Session);
