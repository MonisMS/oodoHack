import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Prisma } from "@prisma/client";
import { buildInvoiceDraft } from "../src/lib/domain/invoice-draft.js";
import { toMinor, fromMinor } from "../src/lib/domain/money.js";

/** Explicit disposable-local benchmark. Generates its own fixtures and removes only those IDs. */
const connection = process.env.PERFORMANCE_TEST_DATABASE_URL;
if (!connection || process.env.NODE_ENV === "production")
  throw new Error(
    "Set PERFORMANCE_TEST_DATABASE_URL to a disposable LOCAL database; production is refused",
  );
const target = new URL(connection);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  !/test/i.test(target.pathname)
)
  throw new Error(
    "Performance fixtures require a loopback database whose name contains test",
  );
if (!process.argv.includes("--fixtures"))
  throw new Error(
    "Pass --fixtures to explicitly opt into creating 5000 temporary subscriptions",
  );
process.env.DATABASE_URL = connection;
process.env.NODE_ENV = "test";
process.env.DEV_AUTH_ENABLED = "false";
const { db } = await import("../src/lib/db.js");
const { app } = await import("../src/app.js");
const { createCredentialUser } = await import("../src/lib/auth.js");
const runId = randomUUID();
const staffEmail = `perf-${runId}@example.test`;
const password = "Perf!Verify9";
const owned = {
  users: [] as string[],
  products: [] as string[],
  plans: [] as string[],
  discounts: [] as string[],
  subs: [] as string[],
};
let server: ReturnType<typeof app.listen> | undefined;
try {
  const staff = await createCredentialUser({
    name: "Performance staff",
    email: staffEmail,
    password,
    role: "ADMIN",
  });
  owned.users.push(staff.id);
  const customers = Array.from({ length: 300 }, (_, n) => ({
    id: randomUUID(),
    name: `Performance customer ${String(n + 1).padStart(3, "0")}`,
    email: `perf-${runId}-${n}@example.test`,
    role: "CUSTOMER" as const,
  }));
  owned.users.push(...customers.map((c) => c.id));
  await db.user.createMany({ data: customers });
  const products = Array.from({ length: 10 }, (_, n) => ({
    id: randomUUID(),
    name: `Performance product ${n + 1}`,
    salesPrice: fromMinor(100000 + n * 10000),
    costPrice: "100.00",
  }));
  owned.products.push(...products.map((p) => p.id));
  await db.product.createMany({ data: products });
  const plans = Array.from({ length: 6 }, (_, n) => ({
    id: randomUUID(),
    name: `Performance plan ${n + 1}`,
    price: fromMinor(10000 + n * 1000),
    billingPeriod: "MONTHLY" as const,
  }));
  owned.plans.push(...plans.map((p) => p.id));
  await db.plan.createMany({ data: plans });
  const discounts = Array.from({ length: 3 }, (_, n) => ({
    id: randomUUID(),
    name: `Performance discount ${n + 1}`,
    type: "PERCENTAGE" as const,
    scope: "SUBSCRIPTION" as const,
    value: "10.00",
    startsAt: new Date("2026-01-01"),
  }));
  owned.discounts.push(...discounts.map((d) => d.id));
  await db.discount.createMany({ data: discounts });
  const subs = Array.from({ length: 5000 }, (_, n) => ({
    id: randomUUID(),
    number: `CPERF/${runId}/${n}`,
    customerId: customers[n % 300]!.id,
    planId: plans[n % 6]!.id,
    planPrice: plans[n % 6]!.price,
    status: "ACTIVE" as const,
    startDate: new Date("2026-07-01"),
    nextInvoiceDate: new Date("2026-10-01"),
    billingAnchorDay: 1,
    billingAnchorMonth: 7,
  }));
  owned.subs.push(...subs.map((s) => s.id));
  const chunks = async <T>(
    rows: T[],
    write: (batch: T[]) => Promise<unknown>,
  ) => {
    for (let n = 0; n < rows.length; n += 500)
      await write(rows.slice(n, n + 500));
  };
  await chunks(subs, (data) => db.subscription.createMany({ data }));
  await chunks(
    subs.map((s, n) => ({
      subscriptionId: s.id,
      productId: products[n % 10]!.id,
      description: products[n % 10]!.name,
      quantity: 1,
      unitPrice: products[n % 10]!.salesPrice,
      position: 0,
    })),
    (data) => db.subscriptionLine.createMany({ data }),
  );
  const invoices: Prisma.InvoiceCreateManyInput[] = [];
  const lines: Prisma.InvoiceLineCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  let expectedRevenue = 0;
  let expectedOutstanding = 0;
  for (let n = 0; n < subs.length; n++)
    for (const month of [7, 8, 9]) {
      const sub = subs[n]!;
      const product = products[n % 10]!;
      const plan = plans[n % 6]!;
      const start = `2026-${String(month).padStart(2, "0")}-01`;
      const end = `2026-${String(month + 1).padStart(2, "0")}-01`;
      const draft = buildInvoiceDraft({
        periodStart: start,
        charges: [
          {
            description: plan.name,
            productId: null,
            quantity: 1,
            unitPrice: plan.price,
            taxes: [],
          },
          {
            description: product.name,
            productId: product.id,
            quantity: 1,
            unitPrice: product.salesPrice,
            taxes: [],
          },
        ],
        discounts: [],
      });
      const paid =
        month < 9
          ? draft.total
          : fromMinor(Math.floor(toMinor(draft.total) / 2));
      const id = randomUUID();
      expectedRevenue += toMinor(paid);
      expectedOutstanding += toMinor(draft.total) - toMinor(paid);
      invoices.push({
        id,
        number: `CPERF/INV/${runId}/${n}/${month}`,
        subscriptionId: sub.id,
        customerId: sub.customerId,
        status: month < 9 ? "PAID" : "PARTIALLY_PAID",
        periodStart: new Date(start),
        periodEnd: new Date(end),
        issueDate: new Date(start),
        dueDate: new Date(`2026-${String(month).padStart(2, "0")}-20`),
        customerName: customers[n % 300]!.name,
        customerEmail: customers[n % 300]!.email,
        subtotal: draft.subtotal,
        taxTotal: draft.taxTotal,
        discountTotal: draft.discountTotal,
        total: draft.total,
        amountPaid: paid,
      });
      lines.push(
        ...draft.lines.map((line) => ({
          invoiceId: id,
          kind: line.kind,
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          taxTotal: line.taxTotal,
          total: line.total,
          taxes: line.taxes as unknown as Prisma.InputJsonValue,
          position: line.position,
        })),
      );
      payments.push({
        invoiceId: id,
        recordedById: staff.id,
        method: "BANK_TRANSFER",
        date: new Date(`2026-${String(month).padStart(2, "0")}-15`),
        amount: paid,
      });
    }
  await chunks(invoices, (data) => db.invoice.createMany({ data }));
  await chunks(lines, (data) => db.invoiceLine.createMany({ data }));
  await chunks(payments, (data) => db.payment.createMany({ data }));
  await db.$executeRaw`ANALYZE "Subscription"`;
  await db.$executeRaw`ANALYZE "Invoice"`;
  await db.$executeRaw`ANALYZE "Payment"`;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No benchmark address");
  const base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(base + "/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    },
    body: JSON.stringify({ email: staffEmail, password }),
  });
  if (!login.ok) throw new Error("Performance sign-in failed");
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const endpoints = [
    "/products",
    "/plans",
    "/discounts",
    "/users/customers",
    "/subscriptions",
    "/subscriptions?page=250",
    "/invoices",
    "/payments",
    "/reports/summary",
    `/reports/summary?from=2026-07-01&to=2026-09-30&planId=${plans[0]!.id}`,
  ];
  const results = [];
  for (const endpoint of endpoints) {
    const times = [];
    for (let trial = 0; trial < 7; trial++) {
      const start = performance.now();
      const response = await fetch(base + "/api" + endpoint, {
        headers: { Cookie: cookie },
      });
      const body = await response.json();
      const duration = performance.now() - start;
      if (!response.ok)
        throw new Error(`${endpoint} returned ${response.status}`);
      if (
        endpoint === "/reports/summary" &&
        (body.data.activeSubscriptions !== 5000 ||
          body.data.revenueCollected !== fromMinor(expectedRevenue) ||
          body.data.outstanding !== fromMinor(expectedOutstanding))
      )
        throw new Error("Aggregate does not match the generated ledger");
      times.push(duration);
    }
    const sorted = [...times].sort((a, b) => a - b);
    results.push({
      endpoint: endpoint.replace(plans[0]!.id, "<fixture-plan>"),
      coldMs: Number(times[0]!.toFixed(1)),
      medianMs: Number(sorted[3]!.toFixed(1)),
      p95Ms: Number(sorted[6]!.toFixed(1)),
      under2s: sorted[6]! < 2000,
    });
  }
  const queryPlan =
    await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT s.id FROM "Subscription" s WHERE s."customerId"=${customers[0]!.id}::uuid ORDER BY s."nextInvoiceDate",s.id LIMIT 20`;
  const report = {
    generatedAt: new Date().toISOString(),
    scope:
      "Loopback HTTP API including real cookie authentication and JSON serialization; seven sequential samples per endpoint, p95 reported as the conservative maximum of seven samples. Not an Internet/network/browser paint SLA.",
    fixtures: {
      customers: 300,
      subscriptions: 5000,
      invoices: 15000,
      payments: 15000,
      invoiceLines: lines.length,
    },
    results,
    queryPlan,
    passed: results.every((r) => r.under2s),
  };
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (outputArg)
    await writeFile(
      outputArg.slice("--output=".length),
      JSON.stringify(report, null, 2),
    );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  await db.discountUsage.deleteMany({
    where: { invoice: { subscriptionId: { in: owned.subs } } },
  });
  await db.payment.deleteMany({
    where: { invoice: { subscriptionId: { in: owned.subs } } },
  });
  await db.invoiceLine.deleteMany({
    where: { invoice: { subscriptionId: { in: owned.subs } } },
  });
  await db.invoice.deleteMany({
    where: { subscriptionId: { in: owned.subs } },
  });
  await db.subscription.deleteMany({ where: { id: { in: owned.subs } } });
  await db.discount.deleteMany({ where: { id: { in: owned.discounts } } });
  await db.product.deleteMany({ where: { id: { in: owned.products } } });
  await db.plan.deleteMany({ where: { id: { in: owned.plans } } });
  await db.user.deleteMany({ where: { id: { in: owned.users } } });
  await db.$disconnect();
}
