import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { db } from '../../lib/db.js';
import { todayBusiness,parseDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import type { Principal } from '../../middleware/auth.js';
import type { reportQuery } from './schemas.js';
type Query=z.infer<typeof reportQuery>;
const money=(value:string)=>new Prisma.Decimal(value).toFixed(2);
/** Aggregate in PostgreSQL, without joining invoice lines/payments into a fan-out. All filters compose. */
export async function summary(q:Query,_actor:Principal){
 if(q.from&&q.to&&q.from>q.to)throw new AppError(422,'VALIDATION_ERROR','Check the date range',{to:['End date must be on or after start date']});
 const filters=Prisma.sql`${q.customerId?Prisma.sql`AND s."customerId"=${q.customerId}::uuid`:Prisma.empty} ${q.planId?Prisma.sql`AND s."planId"=${q.planId}::uuid`:Prisma.empty} ${q.status?Prisma.sql`AND s.status=${q.status}::"SubscriptionStatus"`:Prisma.empty}`;
 const range=(column:Prisma.Sql)=>Prisma.sql`${q.from?Prisma.sql`AND ${column}>=${q.from}::date`:Prisma.empty} ${q.to?Prisma.sql`AND ${column}<=${q.to}::date`:Prisma.empty}`;
 return db.$transaction(async tx=>{
  const [counts]=await tx.$queryRaw<{count:bigint}[]>(Prisma.sql`SELECT count(*) AS count FROM "Subscription" s WHERE s.status='ACTIVE'::"SubscriptionStatus" ${filters} ${range(Prisma.sql`s."startDate"`)}`);
  const [invoices]=await tx.$queryRaw<{outstanding:string;overdueCount:bigint;overdueAmount:string}[]>(Prisma.sql`SELECT COALESCE(sum(i.total-i."amountPaid"),0)::text AS outstanding, count(*) FILTER (WHERE i."dueDate"<${todayBusiness()}::date) AS "overdueCount", COALESCE(sum(i.total-i."amountPaid") FILTER (WHERE i."dueDate"<${todayBusiness()}::date),0)::text AS "overdueAmount" FROM "Invoice" i JOIN "Subscription" s ON s.id=i."subscriptionId" WHERE i.status IN ('CONFIRMED'::"InvoiceStatus",'PARTIALLY_PAID'::"InvoiceStatus") ${filters} ${range(Prisma.sql`i."issueDate"`)}`);
  const revenue=await tx.$queryRaw<{month:string;amount:string;collected:string}[]>(Prisma.sql`SELECT to_char(p.date,'YYYY-MM') AS month,sum(p.amount)::text AS amount,sum(sum(p.amount)) OVER ()::text AS collected FROM "Payment" p JOIN "Invoice" i ON i.id=p."invoiceId" JOIN "Subscription" s ON s.id=i."subscriptionId" WHERE true ${filters} ${range(Prisma.sql`p.date`)} GROUP BY to_char(p.date,'YYYY-MM') ORDER BY month`);
  return {activeSubscriptions:Number(counts!.count),revenueCollected:money(revenue[0]?.collected??'0'),outstanding:money(invoices!.outstanding),overdueCount:Number(invoices!.overdueCount),overdueAmount:money(invoices!.overdueAmount),revenueByMonth:revenue.map(r=>({month:r.month,amount:money(r.amount)}))};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000});
}
