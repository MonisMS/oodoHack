import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { lockCatalogRow as lockRow } from '../../lib/catalog-admin.js';
import { assertProductIds,catalogOrder,literalSearch,databaseInt,invalid,type CatalogQuery } from '../../lib/catalog-admin.js';
import { dateOnly,parseDate } from '../../lib/dates.js';
import type { Principal } from '../../middleware/auth.js';
import type { discountInput } from './schemas.js';
type Input=z.infer<typeof discountInput>;
const include={products:{select:{id:true}}} satisfies Prisma.DiscountInclude;
type Row=Prisma.DiscountGetPayload<{include:typeof include}>;
export const toDiscountDto=(d:Row)=>({id:d.id,name:d.name,type:d.type,scope:d.scope,value:d.value.toFixed(2),minPurchase:d.minPurchase?.toFixed(2)??null,minQuantity:d.minQuantity,startsAt:dateOnly(d.startsAt),endsAt:d.endsAt?dateOnly(d.endsAt):null,usageLimit:d.usageLimit,usedCount:d.usedCount,isActive:d.isActive,productIds:d.products.map(p=>p.id),createdAt:d.createdAt.toISOString(),updatedAt:d.updatedAt.toISOString()});
export async function list(q:CatalogQuery,_actor:Principal){const where:Prisma.DiscountWhereInput=q.search?{name:{contains:literalSearch(q.search),mode:'insensitive'}}:{};const orderBy=catalogOrder(q);const [rows,total]=await db.$transaction([db.discount.findMany({where,include,orderBy,skip:(q.page-1)*q.pageSize,take:q.pageSize}),db.discount.count({where})]);return {data:rows.map(toDiscountDto),page:q.page,pageSize:q.pageSize,total};}
export async function get(id:string,_actor:Principal){const row=await db.discount.findUnique({where:{id},include});if(!row)throw new AppError(404,'NOT_FOUND','Discount not found');return toDiscountDto(row);}
function dataFor(input:Input){databaseInt(input.minQuantity,'minQuantity');databaseInt(input.usageLimit,'usageLimit');const {productIds,startsAt,endsAt,...data}=input;return {...data,startsAt:parseDate(startsAt),endsAt:endsAt?parseDate(endsAt):null,products:{set:productIds.map(id=>({id}))}};}
export async function create(input:Input,actor:Principal){const id=await db.$transaction(async tx=>{await assertProductIds(tx,input.productIds);const {products,...data}=dataFor(input);return (await tx.discount.create({data:{...data,products:{connect:products.set}},select:{id:true}})).id;});return get(id,actor);}
export async function replace(id:string,input:Input,actor:Principal){await db.$transaction(async tx=>{await lockRow(tx,'Discount',id,'Discount not found');const current=await tx.discount.findUniqueOrThrow({where:{id},select:{usedCount:true}});if(input.usageLimit!==null && input.usageLimit<current.usedCount)invalid('usageLimit','Limit cannot be less than the number already used');await assertProductIds(tx,input.productIds);await tx.discount.update({where:{id},data:dataFor(input)});});return get(id,actor);}
export async function remove(id:string,_actor:Principal){await db.discount.update({where:{id},data:{isActive:false}});}
