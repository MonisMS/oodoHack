import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api,queryString,ApiError } from '../../lib/api';
import { useDebounced } from '../../lib/catalog-client';
import type { Page } from '../../types/api';
import { Button } from './kit';
import { Icon } from './Icon';
interface Option{id:string;name:string;isActive?:boolean}
/** Explicit server search/pagination. Never downloads an entire catalog or customer table. */
export function ReferencePicker({path,value,onChange,label,multiple=false,optionalService=false}:{path:string;value:string[];onChange:(ids:string[])=>void;label:string;multiple?:boolean;optionalService?:boolean}){
 const [search,setSearch]=useState('');const term=useDebounced(search);const [page,setPage]=useState(1);const [labels,setLabels]=useState<Record<string,string>>({});
 const result=useQuery({queryKey:['reference',path,term,page],queryFn:({signal})=>api<Page<Option>>(path+queryString({search:term,page,pageSize:10,sortBy:'name',sortOrder:'asc'}),{signal}),retry:false});
 const unavailable=result.error instanceof ApiError&&result.error.status===501;
 const choose=(item:Option)=>{setLabels(old=>({...old,[item.id]:item.name}));onChange(multiple?(value.includes(item.id)?value.filter(v=>v!==item.id):[...value,item.id]):value.includes(item.id)?[]:[item.id]);};
 return <div><div className="search-field"><Icon name="search" size={14}/><input aria-label={`Search ${label}`} value={search} placeholder={`Search ${label.toLowerCase()}…`} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></div>
 {value.length>0&&<div className="selected-chips">{value.map(id=><span className="selected-chip" key={id}>{labels[id]??result.data?.data.find(r=>r.id===id)?.name??`Selected ${label.toLowerCase()}`}<button type="button" aria-label={`Remove selected ${label.toLowerCase()}`} onClick={()=>onChange(value.filter(v=>v!==id))}><Icon name="close" size={11}/></button></span>)}</div>}
 {result.isPending?<p className="picker-summary" role="status">Loading options…</p>:result.error?<div className="picker-summary" role="alert">{unavailable&&optionalService?`${label} are not available yet. ${value.length?'Current selections will be kept.':'You can save without linking any.'}`:'Options could not be loaded.'}<Button type="button" variant="ghost" onClick={()=>result.refetch()}>Retry</Button></div>:<><div className="picker-list">{result.data?.data.filter(item=>item.isActive!==false||value.includes(item.id)).map(item=><label className="picker-option" key={item.id}><input type="checkbox" checked={value.includes(item.id)} onChange={()=>choose(item)} disabled={!value.includes(item.id)&&multiple&&value.length>=100}/><span>{item.name}{item.isActive===false?' · archived':''}</span></label>)}{!result.data?.data.length&&<p className="picker-option">No matches found.</p>}</div>{(result.data?.total??0)>10&&<div className="picker-tools"><Button type="button" variant="secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</Button><span className="small muted">Page {page}</span><Button type="button" variant="secondary" disabled={page*10>=(result.data?.total??0)} onClick={()=>setPage(page+1)}>Next</Button></div>}</>}
 </div>;
}
