import { Prisma } from '@prisma/client';
import { AppError } from './errors.js';
import type { z } from 'zod';
import type { listQuery } from './contracts.js';
export type CatalogQuery = z.infer<typeof listQuery>;
export type CatalogTx = Prisma.TransactionClient;
export const literalSearch=(value:string)=>value.replace(/[\\%_]/g,'\\$&');
const tables={Product:Prisma.sql`"Product"`,Plan:Prisma.sql`"Plan"`,Discount:Prisma.sql`"Discount"`};
export async function lockCatalogRow(tx:CatalogTx,table:keyof typeof tables,id:string,message:string){const rows=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM ${tables[table]} WHERE id=${id}::uuid FOR UPDATE`);if(!rows.length)throw new AppError(404,'NOT_FOUND',message);}
export function catalogOrder(q: CatalogQuery) {
  if (q.sortBy !== 'name' && q.sortBy !== 'createdAt') throw new AppError(422,'VALIDATION_ERROR','Choose a supported sort',{sortBy:['Use name or createdAt']});
  return [{[q.sortBy]:q.sortOrder},{id:'asc'}] as Array<{name?:'asc'|'desc';createdAt?:'asc'|'desc';id?:'asc'|'desc'}>;
}
export function invalid(field:string,message:string):never { throw new AppError(422,'VALIDATION_ERROR','Check the submitted fields',{[field]:[message]}); }
export async function assertTaxIds(tx:CatalogTx,ids:string[]) {
  if (!ids.length)return;
  if(await tx.tax.count({where:{id:{in:ids},isActive:true}})!==ids.length)invalid('taxIds','Choose existing active taxes');
}
export async function assertProductIds(tx:CatalogTx,ids:string[]) {
  if(!ids.length)return;
  if(await tx.product.count({where:{id:{in:ids},isActive:true}})!==ids.length)invalid('productIds','Choose existing active products');
}
export function databaseInt(value:number|null|undefined,field:string) { if(value!=null && value>2147483647)invalid(field,'Maximum is 2147483647'); }
