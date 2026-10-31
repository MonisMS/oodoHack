import { NavLink, Outlet } from 'react-router-dom';
import { nav } from '../../config/nav';
import { useSession } from '../../lib/session';
import type { Role } from '../../types/api';
export function AppLayout() {
  const { role, dev, setRole } = useSession();
  return <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
    <aside className="border-b bg-white p-5 md:border-b-0 md:border-r" aria-label="Main navigation">
      <NavLink to="/" className="text-xl font-bold tracking-tight text-brand-700">◈ Brightloop</NavLink>
      <p className="mt-1 text-xs text-slate-500">Subscriptions, made clear</p>
      <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col">{nav.filter(item => role && item.roles.includes(role)).map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</NavLink>)}</nav>
      {dev && <label className="mt-8 block text-xs text-slate-500">Development role<select className="mt-2 w-full rounded border p-2" value={role || 'ADMIN'} onChange={e => setRole(e.target.value as Role)}><option>ADMIN</option><option>STAFF</option><option>CUSTOMER</option></select></label>}
    </aside>
    <div className="min-w-0"><header className="flex items-center justify-between border-b bg-white px-6 py-4"><span className="text-sm text-slate-500">Brightloop Software</span><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{role || 'Signed out'}</span></header><main id="main" className="mx-auto max-w-7xl p-6 md:p-10"><Outlet /></main></div>
  </div>;
}
