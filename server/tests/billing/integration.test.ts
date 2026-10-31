import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createBillingService,
  type BillingResult,
} from "../../src/modules/billing-engine/service.js";
import { buildInvoiceDraft } from "../../src/lib/domain/invoice-draft.js";
import { DomainError } from "../../src/lib/domain/errors.js";
import { planSubscriptionTransition } from "../../src/lib/domain/states.js";
import { runBillingCycle } from "../../src/jobs/billing.js";

const URL = process.env.BILLING_TEST_DATABASE_URL;
// Separate opt-in, loopback-only database. Cleanup uses only IDs created by this suite.
if (URL) {
  const parsed = new globalThis.URL(URL);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/test/i.test(parsed.pathname)
  )
    throw new Error(
      "Billing tests require a dedicated LOCAL database whose name contains test",
    );
}
describe.skipIf(!URL)("PostgreSQL billing invariants", () => {
  let db: PrismaClient;
  const owned = {
    subs: [] as string[],
    users: [] as string[],
    plans: [] as string[],
    products: [] as string[],
    taxes: [] as string[],
    discounts: [] as string[],
  };
  beforeAll(async () => {
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: URL!, max: 12 }),
    });
    await db.$connect();
  });
  afterEach(async () => {
    const ids = owned.subs;
    await db.discountUsage.deleteMany({
      where: { invoice: { subscriptionId: { in: ids } } },
    });
    await db.payment.deleteMany({
      where: { invoice: { subscriptionId: { in: ids } } },
    });
    await db.invoiceLine.deleteMany({
      where: { invoice: { subscriptionId: { in: ids } } },
    });
    await db.invoice.deleteMany({ where: { subscriptionId: { in: ids } } });
    await db.subscription.deleteMany({ where: { id: { in: ids } } });
    await db.discount.deleteMany({ where: { id: { in: owned.discounts } } });
    await db.plan.deleteMany({ where: { id: { in: owned.plans } } });
    await db.product.deleteMany({ where: { id: { in: owned.products } } });
    await db.tax.deleteMany({ where: { id: { in: owned.taxes } } });
    await db.user.deleteMany({ where: { id: { in: owned.users } } });
    Object.values(owned).forEach((ids) => ids.splice(0));
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  async function fixture(
    options: {
      start?: string;
      expiry?: string;
      status?: "ACTIVE" | "PAUSED";
      autoClose?: boolean;
    } = {},
  ) {
    const id = randomUUID(),
      start = options.start ?? "2026-01-01";
    const user = await db.user.create({
      data: { name: "Billing fixture", email: `billing-${id}@example.test` },
    });
    owned.users.push(user.id);
    const tax = await db.tax.create({
      data: { name: `Tax-${id}`, percentage: "18" },
    });
    owned.taxes.push(tax.id);
    const product = await db.product.create({
      data: {
        name: `Product-${id}`,
        salesPrice: "1000",
        costPrice: "0",
        taxes: { connect: { id: tax.id } },
      },
    });
    owned.products.push(product.id);
    const plan = await db.plan.create({
      data: {
        name: `Plan-${id}`,
        price: "0",
        billingPeriod: "MONTHLY",
        autoClose: options.autoClose ?? false,
        pausable: true,
        renewable: true,
        closableEarly: true,
      },
    });
    owned.plans.push(plan.id);
    const sub = await db.subscription.create({
      data: {
        number: `TEST/${id}`,
        customerId: user.id,
        planId: plan.id,
        status: options.status ?? "ACTIVE",
        startDate: new Date(start),
        nextInvoiceDate: new Date(start),
        expiryDate: options.expiry ? new Date(options.expiry) : null,
        billingAnchorDay: Number(start.slice(8)),
        billingAnchorMonth: Number(start.slice(5, 7)),
        paymentTermsDays: 15,
        lines: {
          create: {
            productId: product.id,
            description: "Subscription product",
            quantity: 1,
            unitPrice: "1000",
            position: 0,
          },
        },
      },
    });
    owned.subs.push(sub.id);
    return { sub, user, tax, product, plan };
  }
  async function discount(
    scope: "SUBSCRIPTION" | "PRODUCT" = "SUBSCRIPTION",
    productId?: string,
    usageLimit: number | null = null,
  ) {
    const created = await db.discount.create({
      data: {
        name: "Fixture discount",
        type: "PERCENTAGE",
        scope,
        value: "10",
        startsAt: new Date("2020-01-01"),
        usageLimit,
        ...(productId ? { products: { connect: { id: productId } } } : {}),
      },
    });
    owned.discounts.push(created.id);
    return created;
  }
  const run = (asOfDate = "2026-01-01") =>
    createBillingService(db).runBilling({ asOfDate });
  async function waitForLockWaiters(
    table: "Subscription" | "Discount",
    count = 2,
  ) {
    const end = Date.now() + 3000;
    while (Date.now() < end) {
      const rows = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%${table}%`}`;
      if (Number(rows[0]!.count) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(
      `The race test did not observe ${count} blocked ${table} transactions`,
    );
  }

  it("generates exact discounted snapshots, due terms and an idempotent cursor", async () => {
    const f = await fixture();
    const d = await discount("PRODUCT", f.product.id);
    expect(await run()).toMatchObject({
      created: 1,
      failed: 0,
      hasMore: false,
    });
    const invoice = await db.invoice.findFirstOrThrow({
      where: { subscriptionId: f.sub.id },
      include: {
        lines: { orderBy: { position: "asc" } },
        discountUsages: true,
      },
    });
    expect(invoice.total.toFixed(2)).toBe("1062.00");
    expect(invoice.taxTotal.toFixed(2)).toBe("162.00");
    expect(invoice.dueDate.toISOString().slice(0, 10)).toBe("2026-01-16");
    expect(
      invoice.lines.find((line) => line.productId === f.product.id)!.taxes,
    ).toMatchObject([
      {
        taxableBase: "900.00",
        grossBase: "1000.00",
        discountAmount: "100.00",
        amount: "162.00",
      },
    ]);
    expect(invoice.discountUsages).toHaveLength(1);
    expect(
      (await db.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount,
    ).toBe(1);
    expect((await run()).created).toBe(0);
    expect(
      (
        await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } })
      ).nextInvoiceDate
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-02-01");
  });
  it("proves same-subscription concurrency with two transactions blocked at a real row lock", async () => {
    const f = await fixture();
    let runs: Promise<BillingResult>[] = [];
    await db.$transaction(
      async (locker) => {
        await locker.$queryRaw`SELECT id FROM "Subscription" WHERE id=${f.sub.id}::uuid FOR UPDATE`;
        runs = [run(), run()];
        await waitForLockWaiters("Subscription");
      },
      { timeout: 6000 },
    );
    const results = await Promise.all(runs);
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1);
    expect(results.every((result) => result.failed === 0)).toBe(true);
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(1);
  }, 20_000);
  it("proves last-redemption concurrency across separate subscriptions and connections", async () => {
    const a = await fixture(),
      b = await fixture(),
      d = await discount("SUBSCRIPTION", undefined, 1);
    let runs: Promise<BillingResult>[] = [];
    const service = createBillingService(db);
    await db.$transaction(
      async (locker) => {
        await locker.$queryRaw`SELECT id FROM "Discount" WHERE id=${d.id}::uuid FOR UPDATE`;
        runs = [
          service.runBilling(
            { asOfDate: "2026-01-01" },
            { excludeSubscriptionIds: [b.sub.id] },
          ),
          service.runBilling(
            { asOfDate: "2026-01-01" },
            { excludeSubscriptionIds: [a.sub.id] },
          ),
        ];
        await waitForLockWaiters("Discount");
      },
      { timeout: 6000 },
    );
    const results = await Promise.all(runs);
    expect(results.every((result) => result.failed === 0)).toBe(true);
    const invoices = await db.invoice.findMany({
      where: { subscriptionId: { in: [a.sub.id, b.sub.id] } },
    });
    expect(invoices.map((invoice) => invoice.total.toFixed(2)).sort()).toEqual([
      "1062.00",
      "1180.00",
    ]);
    expect(
      (await db.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount,
    ).toBe(1);
    expect(await db.discountUsage.count({ where: { discountId: d.id } })).toBe(
      1,
    );
  }, 20_000);
  it("rolls back earlier periods, numbering and usage when a later period fails", async () => {
    const f = await fixture(),
      d = await discount();
    const before = await db.counter.findUnique({
      where: { prefix_year: { prefix: "INV", year: 2026 } },
    });
    const broken = createBillingService(db, {
      buildDraft: (input) => {
        if (input.periodStart === "2026-02-01")
          throw new DomainError(
            "TEST_FAILURE",
            "Injected later-period failure",
          );
        return buildInvoiceDraft(input);
      },
    });
    expect(await broken.runBilling({ asOfDate: "2026-02-01" })).toMatchObject({
      created: 0,
      failed: 1,
    });
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(0);
    expect(
      (await db.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount,
    ).toBe(0);
    expect(
      (
        await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } })
      ).nextInvoiceDate
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-01-01");
    expect(
      await db.counter.findUnique({
        where: { prefix_year: { prefix: "INV", year: 2026 } },
      }),
    ).toEqual(before);
    expect(await run("2026-02-01")).toMatchObject({ created: 2, failed: 0 });
  });
  it("drains catch-up caps, includes expiry and closes only after the final period", async () => {
    const f = await fixture({ expiry: "2026-03-01", autoClose: true });
    const service = createBillingService(db);
    expect(
      await service.runBilling({
        asOfDate: "2026-12-31",
        maxPeriodsPerSubscription: 1,
      }),
    ).toMatchObject({ created: 1, autoClosed: 0, hasMore: true });
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } }))
        .status,
    ).toBe("ACTIVE");
    expect(await service.runBilling({ asOfDate: "2026-12-31" })).toMatchObject({
      created: 2,
      autoClosed: 1,
      hasMore: false,
    });
    const invoices = await db.invoice.findMany({
      where: { subscriptionId: f.sub.id },
      orderBy: { periodStart: "asc" },
    });
    expect(
      invoices.map((invoice) => invoice.periodStart.toISOString().slice(0, 10)),
    ).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(invoices[2]!.periodEnd.toISOString().slice(0, 10)).toBe(
      "2026-03-02",
    );
    expect(
      await db.subscriptionEvent.count({
        where: { subscriptionId: f.sub.id, toStatus: "CLOSED" },
      }),
    ).toBe(1);
    expect((await run("2026-12-31")).created).toBe(0);
  });
  it("never bills paused periods, and auto-closes an expired paused subscription without a charge", async () => {
    const f = await fixture({
      status: "PAUSED",
      expiry: "2026-01-31",
      autoClose: true,
    });
    expect(await run("2026-01-15")).toMatchObject({
      created: 0,
      autoClosed: 0,
    });
    expect(await run("2026-02-01")).toMatchObject({
      created: 0,
      autoClosed: 1,
    });
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(0);
  });
  it("does not leave beyond-expiry non-auto-close subscriptions in an infinite backlog", async () => {
    const f = await fixture({ expiry: "2026-01-15", autoClose: false });
    expect(await run("2026-12-31")).toMatchObject({
      created: 1,
      autoClosed: 0,
      hasMore: false,
    });
    expect(await run("2026-12-31")).toMatchObject({
      created: 0,
      hasMore: false,
    });
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } }))
        .status,
    ).toBe("ACTIVE");
  });
  it("stops consuming an invoice-limited discount within a single catch-up transaction", async () => {
    const f = await fixture(),
      d = await discount("SUBSCRIPTION", undefined, 1);
    expect(await run("2026-02-01")).toMatchObject({ created: 2, failed: 0 });
    const invoices = await db.invoice.findMany({
      where: { subscriptionId: f.sub.id },
      orderBy: { periodStart: "asc" },
    });
    expect(invoices.map((invoice) => invoice.total.toFixed(2))).toEqual([
      "1062.00",
      "1180.00",
    ]);
    expect(
      (await db.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount,
    ).toBe(1);
  });
  it("resumes with a fresh period and does not invoice the waived gap", async () => {
    const f = await fixture();
    await run();
    const context = {
      today: "2026-01-15",
      startDate: "2026-01-01",
      expiryDate: null,
      plan: { pausable: true, renewable: true, closableEarly: true },
      nextInvoiceDate: "2026-02-01",
      billingAnchorDay: 1,
      billingAnchorMonth: 1,
      lastInvoicePeriodEnd: "2026-02-01",
    };
    const paused = planSubscriptionTransition("ACTIVE", "PAUSED", context);
    await db.subscription.update({
      where: { id: f.sub.id },
      data: {
        status: paused.status,
        history: {
          create: {
            fromStatus: "ACTIVE",
            toStatus: "PAUSED",
            createdAt: new Date("2026-01-15"),
          },
        },
      },
    });
    expect((await run("2026-04-01")).created).toBe(0);
    const resumed = planSubscriptionTransition("PAUSED", "ACTIVE", {
      ...context,
      today: "2026-05-20",
    });
    await db.subscription.update({
      where: { id: f.sub.id },
      data: {
        status: resumed.status,
        nextInvoiceDate: new Date(resumed.nextInvoiceDate),
        billingAnchorDay: resumed.billingAnchorDay,
        billingAnchorMonth: resumed.billingAnchorMonth,
        history: {
          create: {
            fromStatus: "PAUSED",
            toStatus: "ACTIVE",
            createdAt: new Date("2026-05-20"),
          },
        },
      },
    });
    expect(await run("2026-05-20")).toMatchObject({ created: 1, failed: 0 });
    const invoices = await db.invoice.findMany({
      where: { subscriptionId: f.sub.id },
      orderBy: { periodStart: "asc" },
    });
    expect(
      invoices.map((invoice) => invoice.periodStart.toISOString().slice(0, 10)),
    ).toEqual(["2026-01-01", "2026-05-20"]);
  });
  it("refuses an incorrectly resumed stale cursor instead of charging the gap", async () => {
    const f = await fixture();
    await db.subscriptionEvent.create({
      data: {
        subscriptionId: f.sub.id,
        fromStatus: "PAUSED",
        toStatus: "ACTIVE",
        createdAt: new Date("2026-03-01"),
      },
    });
    const result = await run("2026-03-01");
    expect(result.failures[0]!.code).toBe("SCHEDULE_RECONCILIATION_REQUIRED");
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(0);
  });
  it("uses bounded failure exclusion so one broken subscription cannot starve healthy work", async () => {
    const bad = await fixture({ start: "2025-12-01" }),
      good = await fixture();
    await db.subscriptionLine.deleteMany({
      where: { subscriptionId: bad.sub.id },
    });
    const cycle = await runBillingCycle({
      asOfDate: "2026-01-01",
      run: createBillingService(db, { maxSubscriptionsPerRun: 1 }).runBilling,
    });
    expect(cycle).toMatchObject({
      created: 1,
      failed: 1,
      batches: 2,
      hasMore: false,
    });
    expect(
      await db.invoice.count({ where: { subscriptionId: good.sub.id } }),
    ).toBe(1);
  });
  it("keeps old invoice values immutable after tax/catalog/customer edits", async () => {
    const f = await fixture();
    await run();
    const original = await db.invoice.findFirstOrThrow({
      where: { subscriptionId: f.sub.id },
      include: { lines: true },
    });
    await db.tax.update({
      where: { id: f.tax.id },
      data: { percentage: "20", name: `Renamed-${f.tax.id}` },
    });
    await db.product.update({
      where: { id: f.product.id },
      data: { salesPrice: "9999" },
    });
    await db.user.update({
      where: { id: f.user.id },
      data: { name: "Changed name" },
    });
    await run("2026-02-01");
    expect(
      await db.invoice.findUniqueOrThrow({
        where: { id: original.id },
        include: { lines: true },
      }),
    ).toEqual(original);
    const next = await db.invoice.findFirstOrThrow({
      where: { subscriptionId: f.sub.id, periodStart: new Date("2026-02-01") },
    });
    expect(next.total.toFixed(2)).toBe("1200.00");
  });
  it("does not treat an invoice-number uniqueness failure as an already-billed period", async () => {
    const f = await fixture();
    const counter = await db.counter.findUnique({
      where: { prefix_year: { prefix: "INV", year: 2026 } },
    });
    const number = `INV/2026/${String((counter?.value ?? 0) + 1).padStart(5, "0")}`;
    await db.invoice.create({
      data: {
        number,
        subscriptionId: f.sub.id,
        customerId: f.user.id,
        periodStart: new Date("2020-01-01"),
        periodEnd: new Date("2020-02-01"),
        issueDate: new Date("2020-01-01"),
        dueDate: new Date("2020-01-01"),
        customerName: f.user.name,
        customerEmail: f.user.email,
        subtotal: "0",
        taxTotal: "0",
        total: "0",
      },
    });
    const result = await run();
    expect(result).toMatchObject({ created: 0, skipped: 0, failed: 1 });
    expect(
      (
        await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } })
      ).nextInvoiceDate
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-01-01");
  });
  it("does not double-charge coverage after an incorrectly reset resume", async () => {
    const f = await fixture();
    await run();
    await db.subscription.update({
      where: { id: f.sub.id },
      data: {
        nextInvoiceDate: new Date("2026-01-25"),
        billingAnchorDay: 25,
        history: {
          create: {
            fromStatus: "PAUSED",
            toStatus: "ACTIVE",
            createdAt: new Date("2026-01-20"),
          },
        },
      },
    });
    const result = await run("2026-01-25");
    expect(result.failures[0]!.code).toBe("SCHEDULE_RECONCILIATION_REQUIRED");
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(1);
  });
  it("does not discard active-service debt when a bad pause integration reaches expiry", async () => {
    const f = await fixture({
      status: "PAUSED",
      expiry: "2026-01-31",
      autoClose: true,
    });
    await db.subscriptionEvent.create({
      data: {
        subscriptionId: f.sub.id,
        fromStatus: "ACTIVE",
        toStatus: "PAUSED",
        createdAt: new Date("2026-01-15"),
      },
    });
    const result = await run("2026-02-01");
    expect(result).toMatchObject({ created: 0, failed: 1, autoClosed: 0 });
    expect(result.failures[0]!.code).toBe("BILLING_BACKLOG");
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } }))
        .status,
    ).toBe("PAUSED");
  });
  it("does not silently advance a stale cursor that already has an invoice", async () => {
    const f = await fixture();
    await run();
    await db.subscription.update({
      where: { id: f.sub.id },
      data: { nextInvoiceDate: new Date("2026-01-01") },
    });
    const result = await run();
    expect(result).toMatchObject({ created: 0, failed: 1, skipped: 0 });
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(1);
    expect(
      (
        await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } })
      ).nextInvoiceDate
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-01-01");
  });
  it("uses the locked plan fee across catalog edits, including zero, with legacy null fallback", async () => {
    const f = await fixture();
    await db.plan.update({ where: { id: f.plan.id }, data: { price: "10" } });
    await db.subscription.update({
      where: { id: f.sub.id },
      data: { planPrice: "10" },
    });
    await run("2026-01-01");
    await db.plan.update({ where: { id: f.plan.id }, data: { price: "99" } });
    await run("2026-02-01");
    const fee = async () =>
      (
        await db.invoice.findMany({
          where: { subscriptionId: f.sub.id },
          orderBy: { periodStart: "asc" },
          include: { lines: true },
        })
      ).map((i) =>
        i.lines.find((l) => l.productId === null)!.unitPrice.toFixed(2),
      );
    expect(await fee()).toEqual(["10.00", "10.00"]);
    await db.subscription.update({
      where: { id: f.sub.id },
      data: { planPrice: "0" },
    });
    await run("2026-03-01");
    await db.subscription.update({
      where: { id: f.sub.id },
      data: { planPrice: null },
    });
    await run("2026-04-01");
    expect(await fee()).toEqual(["10.00", "10.00", "0.00", "99.00"]);
  });
  it("settles only the requested subscription, drains daily backlog beyond 120 periods and stays idempotent", async () => {
    const f = await fixture({
      start: "2026-01-01",
      expiry: "2026-05-10",
      autoClose: true,
    });
    const other = await fixture();
    await db.plan.update({
      where: { id: f.plan.id },
      data: { billingPeriod: "DAILY" },
    });
    const service = createBillingService(db);
    expect(await service.billSubscription(f.sub.id, "2026-05-11")).toEqual({
      created: 130,
    });
    expect(await service.billSubscription(f.sub.id, "2026-05-11")).toEqual({
      created: 0,
    });
    expect(
      await db.invoice.count({ where: { subscriptionId: other.sub.id } }),
    ).toBe(0);
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } }))
        .status,
    ).toBe("ACTIVE");
  });
  it("propagates settlement failures and rolls back its financial batch", async () => {
    const f = await fixture();
    const d = await discount();
    const counter = await db.counter.findUnique({
      where: { prefix_year: { prefix: "INV", year: 2026 } },
    });
    const service = createBillingService(db, {
      buildDraft(input) {
        if (input.periodStart === "2026-02-01")
          throw new Error("injected settlement fault");
        return buildInvoiceDraft(input);
      },
    });
    await expect(
      service.billSubscription(f.sub.id, "2026-02-01"),
    ).rejects.toThrow(/injected/);
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(0);
    expect(
      (await db.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount,
    ).toBe(0);
    expect(
      (
        await db.subscription.findUniqueOrThrow({ where: { id: f.sub.id } })
      ).nextInvoiceDate
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-01-01");
    expect(
      await db.counter.findUnique({
        where: { prefix_year: { prefix: "INV", year: 2026 } },
      }),
    ).toEqual(counter);
  });
  it("serializes targeted settlement against a batch run without duplicate invoices or discount usage", async () => {
    const f = await fixture();
    const d = await discount();
    let single: Promise<{ created: number }>;
    let batch: Promise<BillingResult>;
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id=${f.sub.id}::uuid FOR UPDATE`;
        single = createBillingService(db).billSubscription(
          f.sub.id,
          "2026-01-01",
        );
        batch = run();
        await waitForLockWaiters("Subscription");
      },
      { timeout: 6000 },
    );
    const results = await Promise.all([single!, batch!]);
    expect(results.reduce((sum, r) => sum + r.created, 0)).toBe(1);
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(1);
    expect(
      (await db.discount.findUniqueOrThrow({ where: { id: d.id } })).usedCount,
    ).toBe(1);
  });
  it("refuses future settlement and inactive customers without creating financial records", async () => {
    const f = await fixture();
    const service = createBillingService(db);
    await expect(
      service.billSubscription(f.sub.id, "9999-01-01"),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });
    await db.user.update({
      where: { id: f.user.id },
      data: { isActive: false },
    });
    await expect(
      service.billSubscription(f.sub.id, "2026-01-01"),
    ).rejects.toMatchObject({ code: "INVALID_CUSTOMER" });
    expect(
      await db.invoice.count({ where: { subscriptionId: f.sub.id } }),
    ).toBe(0);
    expect((await run()).failures[0]!.code).toBe("INVALID_CUSTOMER");
  });
});
