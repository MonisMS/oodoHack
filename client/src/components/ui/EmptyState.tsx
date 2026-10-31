import type { ReactNode } from 'react';
import { Icon } from './Icon';
export function EmptyState({title,children,action,icon='box'}:{title:string;children?:ReactNode;action?:ReactNode;icon?:string}){return <section className="empty-state"><div className="empty-icon"><Icon name={icon} size={25}/></div><h2>{title}</h2><div className="empty-description">{children}</div>{action&&<div className="empty-action">{action}</div>}</section>;}
