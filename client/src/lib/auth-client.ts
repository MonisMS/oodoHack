import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';

// Same-origin: Vite proxies /api to Express, so the session cookie needs no CORS handling in development.
// Production must serve the SPA and API from one origin (or set VITE_AUTH_BASE_URL).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_BASE_URL || undefined,
  plugins: [inferAdditionalFields({ user: { role: { type: 'string', input: false }, isActive: { type: 'boolean', input: false } } })],
});
