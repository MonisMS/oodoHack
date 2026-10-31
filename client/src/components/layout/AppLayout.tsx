import { useState } from 'react';
import { Link,NavLink,Outlet,useLocation,useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { nav } from '../../config/nav';
import { useSession } from '../../lib/session';
import { Button,ToastProvider,useToast } from '../ui/kit';
import { Icon } from '../ui/Icon';
import type { Role } from '../../types/api';
export function Brand(){return <Link to="/" className="brand" aria-label="Brightloop home"><span className="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M7 7a5 5 0 1 1 0 10H5V7h2Zm10 0a5 5 0 1 0 0 10h2V7h-2Z"/></svg></span>brightloop<span style={{color:'#9aa78f',fontSize:18}}>.</span></Link>;}
const icons:Record<string,string>={'/dashboard':'grid','/subscriptions':'repeat','/quotation-templates':'file','/invoices':'file','/billing':'refresh','/payments':'credit','/products':'box','/plans':'layers','/discounts':'tag','/taxes':'settings','/users/customers':'users','/users/staff':'shield','/portal/subscriptions':'repeat','/portal/invoices':'file'};
const groups=[{label:'Workspace',paths:['/dashboard','/portal/subscriptions','/portal/invoices']},{label:'Revenue',paths:['/subscriptions','/quotation-templates','/invoices','/payments','/billing']},{label:'Catalog',paths:['/products','/plans','/discounts','/taxes']},{label:'People',paths:['/users/customers','/users/staff']}];
function Shell(){const {user,role,dev,setRole,signOut}=useSession();const [open,setOpen]=useState(false);const [leaving,setLeaving]=useState(false);const location=useLocation();const navigate=useNavigate();const cache=useQueryClient();const {notify}=useToast();
 const authPage=['/login','/signup','/forgot-password','/reset-password'].includes(location.pathname);
 if(authPage)return <Outlet/>;
 const current=nav.find(n=>location.pathname===n.to||location.pathname.startsWith(n.to+'/'));
 const group=groups.find(g=>current&&g.paths.includes(current.to));
 const logout=async()=>{setLeaving(true);const result=await signOut();setLeaving(false);if(result.ok){cache.clear();navigate('/login');}else notify(result.message);};
 return <div><a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>{open&&<button className="nav-overlay" aria-label="Close navigation" onClick={()=>setOpen(false)}/>}
  <aside className={`app-sidebar ${open?'is-open':''}`} aria-label="Main navigation"><Brand/><p className="workspace-name">Brightloop Software</p><nav className="sidebar-nav">{groups.map(g=>{const items=nav.filter(n=>g.paths.includes(n.to)&&role&&n.roles.includes(role));return items.length?<div className="nav-group" key={g.label}><p className="nav-label">{g.label}</p>{items.map(n=><NavLink key={n.to} to={n.to} onClick={()=>setOpen(false)} className={({isActive})=>`nav-link ${isActive?'active':''}`}><Icon name={icons[n.to]}/>{n.label==='Run billing'?'Billing runs':n.label}</NavLink>)}</div>:null;})}</nav>
  {dev&&<label className="small muted" style={{marginBottom:16}}>Development role<select className="input" value={role??'ADMIN'} onChange={e=>{cache.clear();setRole(e.target.value as Role);}}><option>ADMIN</option><option>STAFF</option><option>CUSTOMER</option></select></label>}
  <div className="sidebar-footer"><div className="avatar">{(user?.name??'Workspace').split(' ').map(n=>n[0]).slice(0,2).join('')}</div><div className="sidebar-user"><strong>{user?.name??'Your workspace'}</strong><span>{role?.toLowerCase()??'Signed out'}</span></div>{user?<Button variant="ghost" aria-label="Sign out" disabled={leaving} onClick={logout}><Icon name="logout" size={16}/></Button>:<Link to="/login" className="text-link small">Sign in</Link>}</div></aside>
  <div className="app-main"><header className="app-topbar"><div className="breadcrumb"><Button variant="ghost" className="mobile-nav-button" aria-label="Open navigation" onClick={()=>setOpen(true)}><Icon name="menu"/></Button><span>{group?.label??'Workspace'}</span><Icon name="chevron" size={11}/><strong>{current?.label??'Brightloop'}</strong></div><div className="topbar-right"><span className="date-label">{new Intl.DateTimeFormat('en-IN',{month:'long',day:'numeric',year:'numeric'}).format(new Date())}</span><span><i className="workspace-dot"/>INR</span></div></header><main id="main" className="app-content"><Outlet/></main></div></div>;
}
export function AppLayout(){return <ToastProvider><Shell/></ToastProvider>;}
