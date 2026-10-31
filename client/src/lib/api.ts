import type { ApiErrorBody, Role } from '../types/api';
export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) { super(body.error.message); }
}
let session: { role?: Role; id?: string } = {};
// Real sessions are httpOnly cookies sent via credentials: 'include'. This holds only the opt-in dev identity.
// Real API permissions always run server-side.
export function setApiSession(value: typeof session) { session = value; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_ENABLED === 'true' && session.role && session.id) {
    headers.set('x-dev-role', session.role); headers.set('x-dev-user-id', session.id);
  }
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}${path}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: { code: 'HTTP_ERROR', message: `Request failed (${response.status})` } })) as ApiErrorBody;
    throw new ApiError(response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(query)) if (value !== undefined && value !== null) params.set(key, String(value));
  return params.size ? `?${params}` : '';
}
