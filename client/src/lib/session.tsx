import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Role } from '../types/api';
import { setApiSession } from './api';
const dev = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_ENABLED === 'true';
const Session = createContext<{ role: Role | null; dev: boolean; setRole: (role: Role) => void }>({ role: null, dev, setRole: () => {} });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, changeRole] = useState<Role | null>(dev ? 'ADMIN' : null);
  function setRole(next: Role) { if (dev) { setApiSession({ role: next, id: '00000000-0000-4000-8000-000000000001' }); changeRole(next); } }
  // Stable dev identity only. Does not claim to exist in the database.
  if (dev && role) setApiSession({ role, id: '00000000-0000-4000-8000-000000000001' });
  return <Session.Provider value={{ role, dev, setRole }}>{children}</Session.Provider>;
}
export const useSession = () => useContext(Session);
