import { Prisma, type PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { db } from "../../lib/db.js";
import { billingInput } from "../../lib/contracts.js";
import { nextNumber } from "../../lib/numbers.js";
import { todayBusiness } from "../../lib/dates.js";
import { DomainError, invariant } from "../../lib/domain/errors.js";
import {
  buildInvoiceDraft,
  type InvoiceDraftInput,
  type InvoiceDraft,
} from "../../lib/domain/invoice-draft.js";
import {
  billingPeriods,
  addDays,
  dateOnly,
  parseDate,
} from "../../lib/domain/period.js";
import type { DiscountRule } from "../../lib/domain/discount.js";
import { isInvoicePeriodConflict, withTransactionRetry } from "./retry.js";

export interface BillingInput {
  asOfDate: string;
  maxPeriodsPerSubscription?: number;
}
export interface BillingResult {
  created: number;
  skipped: number;
  failed: number;
  autoClosed: number;
  hasMore: boolean;
  failures: { subscriptionId: string; code: string; message: string }[];
}
export interface BillingRunOptions {
  excludeSubscriptionIds?: readonly string[];
}
export interface BillingServiceOptions {
  maxSubscriptionsPerRun?: number;
  retryAttempts?: number;
  transactionTimeoutMs?: number;
  maxRunDurationMs?: number;
  /** Pure calculation dependency; production uses the exact shared calculator. */
  buildDraft?: (input: InvoiceDraftInput) => InvoiceDraft;
}

const taxSelect = { id: true, name: true, percentage: true } as const;
const subscriptionSelect = {
  id: true,
  number: true,
  status: true,
  startDate: true,
  expiryDate: true,
  nextInvoiceDate: true,
  billingAnchorDay: true,
  billingAnchorMonth: true,
  paymentTermsDays: true,
  planPrice: true,
  customerId: true,
  customer: { select: { name: true, email: true, role: true, isActive: true } },
  plan: {
    select: {
      id: true,
      name: true,
      price: true,
      billingPeriod: true,
      autoClose: true,
      taxes: { where: { isActive: true }, select: taxSelect },
    },
  },
  lines: {
    orderBy: { position: "asc" },
    select: {
      productId: true,
      variantId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      product: {
        select: { taxes: { where: { isActive: true }, select: taxSelect } },
      },
      variant: { select: { productId: true } },
    },
  },
  history: {
    where: { toStatus: "ACTIVE", fromStatus: { in: ["PAUSED", "CLOSED"] } },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdAt: true },
  },
} as const satisfies Prisma.SubscriptionSelect;

function billablePredicate(asOfDate: string): Prisma.Sql {
  return Prisma.sql`s."startDate" <= ${asOfDate}::date AND (
    (s.status = 'ACTIVE'::"SubscriptionStatus" AND s."nextInvoiceDate" <= ${asOfDate}::date
      AND (s."expiryDate" IS NULL OR s."nextInvoiceDate" <= s."expiryDate"))
    OR (s.status IN ('ACTIVE'::"SubscriptionStatus",'PAUSED'::"SubscriptionStatus")
      AND p."autoClose" = true AND s."expiryDate" < ${asOfDate}::date)
  )`;
}

export function createBillingService(
  client: PrismaClient,
  options: BillingServiceOptions = {},
) {
  const limit = options.maxSubscriptionsPerRun ?? 100;
  const retryAttempts = options.retryAttempts ?? 3;
  const timeout = options.transactionTimeoutMs ?? 15_000;
  const maxDuration = options.maxRunDurationMs ?? 25_000;
  const calculator = options.buildDraft ?? buildInvoiceDraft;
  invariant(
    Number.isInteger(limit) && limit >= 1 && limit <= 1000,
    "INVALID_LIMIT",
    "Billing subscription limit must be from 1 to 1000",
  );
  invariant(
    Number.isInteger(retryAttempts) &&
      retryAttempts >= 1 &&
      retryAttempts <= 10,
    "INVALID_LIMIT",
    "Retry attempts must be from 1 to 10",
  );
  invariant(
    Number.isInteger(timeout) && timeout >= 1000 && timeout <= 60_000,
    "INVALID_LIMIT",
    "Transaction timeout must be from 1000 to 60000 ms",
  );
  invariant(
    Number.isInteger(maxDuration) && maxDuration >= 1 && maxDuration <= 300_000,
    "INVALID_LIMIT",
    "Run time budget must be from 1 to 300000 ms",
  );

  async function candidates(
    asOfDate: string,
    excluded: readonly string[],
    take: number,
  ): Promise<{ id: string }[]> {
    const exclusion = excluded.length
      ? Prisma.sql`AND s.id NOT IN (${Prisma.join(excluded.map((id) => Prisma.sql`${id}::uuid`))})`
      : Prisma.empty;
    return client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT s.id FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
      WHERE ${billablePredicate(asOfDate)} ${exclusion}
      ORDER BY s."nextInvoiceDate",s.id LIMIT ${take}`);
  }

  async function processSubscription(
    subscriptionId: string,
    input: Required<BillingInput>,
    closeExpired = true,
  ) {
    return withTransactionRetry(
      () =>
        client.$transaction(
          async (tx) => {
            await tx.$queryRaw(
              Prisma.sql`SELECT id FROM "Subscription" WHERE id = ${subscriptionId}::uuid FOR UPDATE`,
            );
            const sub = await tx.subscription.findUnique({
              where: { id: subscriptionId },
              select: subscriptionSelect,
            });
            if (
              !sub ||
              !["ACTIVE", "PAUSED"].includes(sub.status) ||
              dateOnly(sub.startDate) > input.asOfDate
            )
              return { created: 0, autoClosed: 0 };
            const expiry = sub.expiryDate ? dateOnly(sub.expiryDate) : null;
            if (sub.status === "PAUSED") {
              if (
                closeExpired &&
                expiry &&
                expiry < input.asOfDate &&
                sub.plan.autoClose
              ) {
                const paused = await tx.subscriptionEvent.findFirst({
                  where: {
                    subscriptionId: sub.id,
                    fromStatus: "ACTIVE",
                    toStatus: "PAUSED",
                  },
                  orderBy: { createdAt: "desc" },
                  select: { createdAt: true },
                });
                invariant(
                  !paused ||
                    dateOnly(sub.nextInvoiceDate) >
                      (expiry < todayBusiness(paused.createdAt)
                        ? expiry
                        : todayBusiness(paused.createdAt)),
                  "BILLING_BACKLOG",
                  "Unbilled active service before the pause requires reconciliation before automatic closure",
                );
                await tx.subscription.update({
                  where: { id: sub.id },
                  data: {
                    status: "CLOSED",
                    history: {
                      create: {
                        fromStatus: "PAUSED",
                        toStatus: "CLOSED",
                        reason: `Automatic expiry on ${input.asOfDate}; paused gap remains uncharged`,
                      },
                    },
                  },
                });
                return { created: 0, autoClosed: 1 };
              }
              return { created: 0, autoClosed: 0 };
            }
            const resumed = sub.history[0];
            invariant(
              !resumed ||
                dateOnly(sub.nextInvoiceDate) >=
                  todayBusiness(resumed.createdAt),
              "SCHEDULE_RECONCILIATION_REQUIRED",
              "Resume/renew must reset the schedule before billing so paused or closed gaps are not charged",
            );
            const coverage = await tx.invoice.aggregate({
              where: { subscriptionId: sub.id },
              _max: { periodEnd: true },
            });
            invariant(
              !coverage._max.periodEnd ||
                sub.nextInvoiceDate >= coverage._max.periodEnd,
              "SCHEDULE_RECONCILIATION_REQUIRED",
              "The billing cursor overlaps an existing invoice period; reconcile the schedule instead of charging twice",
            );
            invariant(
              sub.customer.role === "CUSTOMER" && sub.customer.isActive,
              "INVALID_CUSTOMER",
              "The subscription must belong to an active customer",
            );
            invariant(
              Number.isInteger(sub.paymentTermsDays) &&
                sub.paymentTermsDays >= 0 &&
                sub.paymentTermsDays <= 365,
              "INVALID_PAYMENT_TERMS",
              "Payment terms must be from zero to 365 days",
            );
            const schedule = billingPeriods({
              nextInvoiceDate: dateOnly(sub.nextInvoiceDate),
              period: sub.plan.billingPeriod,
              anchor: {
                day: sub.billingAnchorDay,
                month: sub.billingAnchorMonth,
              },
              asOfDate: input.asOfDate,
              expiryDate: expiry,
              max: input.maxPeriodsPerSubscription,
            });
            let created = 0;
            if (schedule.periods.length) {
              invariant(
                sub.lines.length >= 1 && sub.lines.length <= 100,
                "INVALID_SUBSCRIPTION_LINES",
                "A subscription must have between 1 and 100 product lines",
              );
              for (const line of sub.lines)
                invariant(
                  !line.variantId || line.variant?.productId === line.productId,
                  "INVALID_VARIANT",
                  "A subscription variant must belong to its product",
                );
              const productIds = [
                ...new Set(sub.lines.map((line) => line.productId)),
              ];
              const first = parseDate(schedule.periods[0]!.start);
              const last = parseDate(schedule.periods.at(-1)!.start);
              const where: Prisma.DiscountWhereInput = {
                isActive: true,
                startsAt: { lte: last },
                AND: [
                  { OR: [{ endsAt: null }, { endsAt: { gte: first } }] },
                  {
                    OR: [
                      { scope: "SUBSCRIPTION" },
                      {
                        scope: "PRODUCT",
                        products: { some: { id: { in: productIds } } },
                      },
                    ],
                  },
                ],
              };
              const discountIds = await tx.discount.findMany({
                where,
                select: { id: true },
                orderBy: { id: "asc" },
                take: 1001,
              });
              invariant(
                discountIds.length <= 1000,
                "BILLING_CONFIGURATION_LIMIT",
                "More than 1000 discount candidates require configuration review",
              );
              if (discountIds.length)
                await tx.$queryRaw(
                  Prisma.sql`SELECT id FROM "Discount" WHERE id IN (${Prisma.join(discountIds.map((rule) => Prisma.sql`${rule.id}::uuid`))}) ORDER BY id FOR UPDATE`,
                );
              const discounts = discountIds.length
                ? await tx.discount.findMany({
                    where: { id: { in: discountIds.map((rule) => rule.id) } },
                    include: { products: { select: { id: true } } },
                    orderBy: { id: "asc" },
                  })
                : [];
              const rules: DiscountRule[] = discounts.map((rule) => ({
                id: rule.id,
                name: rule.name,
                type: rule.type,
                scope: rule.scope,
                value: rule.value.toFixed(2),
                productIds: rule.products.map((product) => product.id),
                minPurchase: rule.minPurchase?.toFixed(2) ?? null,
                minQuantity: rule.minQuantity,
                startsAt: dateOnly(rule.startsAt),
                endsAt: rule.endsAt ? dateOnly(rule.endsAt) : null,
                usageLimit: rule.usageLimit,
                usedCount: rule.usedCount,
                isActive: rule.isActive,
              }));
              const taxInput = (taxes: typeof sub.plan.taxes) =>
                taxes.map((tax) => ({
                  id: tax.id,
                  name: tax.name,
                  percentage: tax.percentage.toString(),
                }));
              const charges: InvoiceDraftInput["charges"] = [
                {
                  productId: null,
                  description: sub.plan.name,
                  quantity: 1,
                  unitPrice: (sub.planPrice ?? sub.plan.price).toFixed(2),
                  taxes: taxInput(sub.plan.taxes),
                },
                ...sub.lines.map((line) => ({
                  productId: line.productId,
                  variantId: line.variantId,
                  description: line.description,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice.toFixed(2),
                  taxes: taxInput(line.product.taxes),
                })),
              ];
              for (const period of schedule.periods) {
                const draft = calculator({
                  periodStart: period.start,
                  charges,
                  discounts: rules,
                });
                for (const usage of draft.discountUsages) {
                  const reserved = await tx.$queryRaw<{ id: string }[]>(
                    Prisma.sql`UPDATE "Discount" SET "usedCount" = "usedCount" + 1 WHERE id = ${usage.discountId}::uuid AND "isActive" = true AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit") RETURNING id`,
                  );
                  invariant(
                    reserved.length === 1,
                    "DISCOUNT_RESERVATION_CONFLICT",
                    "A discount was changed or exhausted concurrently",
                  );
                  rules.find(
                    (rule) => rule.id === usage.discountId,
                  )!.usedCount += 1;
                }
                const number = await nextNumber(
                  tx,
                  "INV",
                  parseDate(input.asOfDate).getUTCFullYear(),
                );
                const invoice = await tx.invoice.create({
                  data: {
                    number,
                    subscriptionId: sub.id,
                    customerId: sub.customerId,
                    status: "DRAFT",
                    periodStart: parseDate(period.start),
                    periodEnd: parseDate(period.end),
                    issueDate: parseDate(input.asOfDate),
                    dueDate: parseDate(
                      addDays(input.asOfDate, sub.paymentTermsDays),
                    ),
                    customerName: sub.customer.name,
                    customerEmail: sub.customer.email,
                    subtotal: draft.subtotal,
                    discountTotal: draft.discountTotal,
                    taxTotal: draft.taxTotal,
                    total: draft.total,
                  },
                });
                // Keep financial writes explicitly ordered on this same transaction.
                await tx.invoiceLine.createMany({
                  data: draft.lines.map((line) => ({
                    invoiceId: invoice.id,
                    kind: line.kind,
                    productId: line.productId,
                    variantId: line.variantId,
                    discountId: line.discountId,
                    description: line.description,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    subtotal: line.subtotal,
                    taxTotal: line.taxTotal,
                    total: line.total,
                    taxes: line.taxes.map((tax) => ({
                      ...tax,
                      discounts: tax.discounts.map((discount) => ({
                        ...discount,
                      })),
                    })),
                    position: line.position,
                  })),
                });
                if (draft.discountUsages.length)
                  await tx.discountUsage.createMany({
                    data: draft.discountUsages.map((usage) => ({
                      invoiceId: invoice.id,
                      discountId: usage.discountId,
                      amount: usage.amount,
                    })),
                  });
                created += 1;
              }
            }
            const autoClose = !!(
              closeExpired &&
              expiry &&
              expiry < input.asOfDate &&
              schedule.nextInvoiceDate > expiry &&
              sub.plan.autoClose
            );
            if (created || autoClose)
              await tx.subscription.update({
                where: { id: sub.id },
                data: {
                  nextInvoiceDate: parseDate(schedule.nextInvoiceDate),
                  ...(autoClose
                    ? {
                        status: "CLOSED",
                        history: {
                          create: {
                            fromStatus: "ACTIVE",
                            toStatus: "CLOSED",
                            reason: `Automatic expiry on ${input.asOfDate}; all billable periods invoiced`,
                          },
                        },
                      }
                    : {}),
                },
              });
            return { created, autoClosed: autoClose ? 1 : 0 };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout,
          },
        ),
      retryAttempts,
    );
  }

  async function runBilling(
    rawInput: BillingInput,
    runOptions: BillingRunOptions = {},
  ): Promise<BillingResult> {
    const input = billingInput.parse(rawInput);
    parseDate(input.asOfDate); // JavaScript accepts year zero; PostgreSQL's calendar does not.
    const excluded = [...new Set(runOptions.excludeSubscriptionIds ?? [])];
    invariant(
      excluded.length <= 10_000 &&
        excluded.every((id) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ),
        ),
      "INVALID_EXCLUSION",
      "Invalid billing exclusion identifiers",
    );
    const result: BillingResult = {
      created: 0,
      skipped: 0,
      failed: 0,
      autoClosed: 0,
      hasMore: false,
      failures: [],
    };
    const started = performance.now();
    const selected = await candidates(input.asOfDate, excluded, limit);
    for (const { id } of selected) {
      // Stop only between transactions; never leave a subscription partially billed.
      if (performance.now() - started >= maxDuration) break;
      try {
        const outcome = await processSubscription(id, input);
        result.created += outcome.created;
        result.autoClosed += outcome.autoClosed;
        if (outcome.created === 0) result.skipped += 1;
      } catch (error) {
        if (isInvoicePeriodConflict(error)) {
          const current = await client.subscription.findUnique({
            where: { id },
            select: { nextInvoiceDate: true },
          });
          const existing = await client.invoice.findFirst({
            where: { subscriptionId: id },
            orderBy: { periodStart: "desc" },
            select: { periodStart: true },
          });
          if (
            current &&
            existing &&
            current.nextInvoiceDate > existing.periodStart
          ) {
            result.skipped += 1;
            continue;
          }
        }
        result.failed += 1;
        result.failures.push({
          subscriptionId: id,
          code: error instanceof DomainError ? error.code : "BILLING_FAILED",
          message:
            error instanceof DomainError
              ? error.message
              : "Billing could not complete; this subscription was rolled back",
        });
      }
    }
    // Failed subscriptions are reported explicitly, not an infinite no-progress backlog.
    const omit = [
      ...excluded,
      ...result.failures.map((failure) => failure.subscriptionId),
    ];
    result.hasMore = (await candidates(input.asOfDate, omit, 1)).length > 0;
    return result;
  }
  /** One subscription only, with the same lock, atomic batch and retry policy as scheduled billing.
   * Bounded draining handles daily backlogs beyond the HTTP batch cap. A failure is propagated;
   * committed earlier batches remain valid and retrying cannot duplicate them.
   * Call outside a lifecycle transaction, then recheck status/cursor under that transaction's lock.
   */
  async function billSubscription(
    subscriptionId: string,
    asOfDate: string,
  ): Promise<{ created: number }> {
    invariant(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        subscriptionId,
      ),
      "INVALID_SUBSCRIPTION",
      "A valid subscription ID is required",
    );
    const input = billingInput.parse({
      asOfDate,
      maxPeriodsPerSubscription: 120,
    });
    parseDate(input.asOfDate);
    invariant(
      input.asOfDate <= todayBusiness(),
      "INVALID_DATE",
      "Billing date cannot be in the future",
    );
    const started = performance.now();
    let created = 0;
    for (let batch = 0; batch < 32; batch += 1) {
      const outcome = await processSubscription(subscriptionId, input, false);
      created += outcome.created;
      const remaining = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT s.id FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
        WHERE s.id = ${subscriptionId}::uuid AND s.status = 'ACTIVE'::"SubscriptionStatus"
          AND s."startDate" <= ${input.asOfDate}::date AND s."nextInvoiceDate" <= ${input.asOfDate}::date
          AND (s."expiryDate" IS NULL OR s."nextInvoiceDate" <= s."expiryDate") LIMIT 1`);
      if (remaining.length === 0) return { created };
      invariant(
        outcome.created > 0 && performance.now() - started < maxDuration,
        "BILLING_BACKLOG",
        "Billing settlement reached its safe limit; retry before changing the subscription",
      );
    }
    throw new DomainError(
      "BILLING_BACKLOG",
      "Billing settlement reached its batch limit; retry before changing the subscription",
    );
  }
  return { runBilling, billSubscription };
}

const billingService = createBillingService(db);
export const runBilling = billingService.runBilling;
export const billSubscription = billingService.billSubscription;
