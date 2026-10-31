import type { ReactNode } from 'react';
import type { Role } from '../types/api';
import { useSession } from './session';
export interface ModuleRoute { path: string; element: ReactNode; roles?: Role[] }
export function RouteAccess({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { role } = useSession();
  if (roles && !role) return <p role="status">Sign in to access this page. Authentication is pending Person C's workstream.</p>;
  if (roles && role && !roles.includes(role)) return <p role="alert">Your role cannot access this page.</p>;
  return children;
}
