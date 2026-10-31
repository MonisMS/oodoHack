import type { ReactNode } from 'react';
import { Navigate,useLocation } from 'react-router-dom';
import type { Role } from '../types/api';
import { useSession } from './session';
import { EmptyState } from '../components/ui/EmptyState';
import { Loading } from '../components/ui/kit';
export interface ModuleRoute{path:string;element:ReactNode;roles?:Role[]}
export function RouteAccess({roles,children}:{roles?:Role[];children:ReactNode}){const {role,status}=useSession();const location=useLocation();if(roles&&status==='loading')return <Loading label="Opening your workspace…"/>;if(roles&&!role)return <Navigate to="/login" replace state={{from:location.pathname+location.search}}/>;if(roles&&role&&!roles.includes(role))return <EmptyState title="This page is restricted" icon="shield">Your account does not have access to this area. Choose an available page from the navigation.</EmptyState>;return children;}
