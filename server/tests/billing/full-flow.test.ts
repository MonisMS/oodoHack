import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { addDays } from "../../src/lib/domain/period.js";

const TEST_DB = process.env.BILLING_FLOW_TEST_DATABASE_URL;
if (TEST_DB) {
  const url = new URL(TEST_DB);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/test/i.test(url.pathname)
  )
    throw new Error("Billing flow requires a dedicated local test database");
}

describe.skipIf(!TEST_DB)("merged A/B real HTTP financial flow", () => {
  let app: Express;
  let db: typeof import("../../src/lib/db.js").db;
  let createUser: typeof import("../../src/lib/auth.js").createCredentialUser;
  const owned = {
    users: [] as string[],
    products: [] as string[],
    plans: [] as string[],
    taxes: [] as string[],
    discounts: [] as string[],
    templates: [] as string[],
    subs: [] as string[],
  };
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    process.env.NODE_ENV = "test";
    process.env.DEV_AUTH_ENABLED = "false";
    ({ app } = await import("../../src/app.js"));
    ({ db } = await import("../../src/lib/db.js"));
    ({ createCredentialUser: createUser } =
      await import("../../src/lib/auth.js"));
  });
  afterAll(async () => {
    if (!db) return;
    await db.payment.deleteMany({
      where: { invoice: { subscriptionId: { in: owned.subs } } },
    });
    await db.discountUsage.deleteMany({
      where: { invoice: { subscriptionId: { in: owned.subs } } },
    });
    await db.invoiceLine.deleteMany({
      where: { invoice: { subscriptionId: { in: owned.subs } } },
    });
    await db.invoice.deleteMany({
      where: { subscriptionId: { in: owned.subs } },
    });
    await db.subscription.deleteMany({ where: { id: { in: owned.subs } } });
    await db.quotationTemplate.deleteMany({
      where: { id: { in: owned.templates } },
    });
    await db.discount.deleteMany({ where: { id: { in: owned.discounts } } });
    await db.plan.deleteMany({ where: { id: { in: owned.plans } } });
    await db.productVariant.deleteMany({
      where: { productId: { in: owned.products } },
    });
    await db.product.deleteMany({ where: { id: { in: owned.products } } });
    await db.tax.deleteMany({ where: { id: { in: owned.taxes } } });
    await db.user.deleteMany({ where: { id: { in: owned.users } } });
    await db.$disconnect();
  });
  it("runs signup → template → activation → exact discounted billing → payment → pause/renew without duplicate charges", async () => {
    const suffix = randomUUID(),
      password = "Str0ng!Passw",
      today = new Date().toISOString().slice(0, 10),
      origin = "http://localhost:5173";
    const staff = await createUser({
      name: "Flow staff",
      email: `flowstaff-${suffix}@example.test`,
      password,
      role: "STAFF",
    });
    owned.users.push(staff.id);
    const actor = request.agent(app),
      customer = request.agent(app);
    expect(
      (
        await actor
          .post("/api/auth/sign-in/email")
          .set("Origin", origin)
          .send({ email: staff.email, password })
      ).status,
    ).toBe(200);
    const signup = await customer
      .post("/api/auth/sign-up/email")
      .set("Origin", origin)
      .send({
        name: "Flow customer",
        email: `flowcust-${suffix}@example.test`,
        password,
      });
    expect(signup.status).toBe(200);
    const customerId = signup.body.user.id as string;
    owned.users.push(customerId);
    expect(
      (await customer.post("/api/billing/run").send({ asOfDate: today }))
        .status,
    ).toBe(403);

    const tax = await db.tax.create({
      data: { name: `Flow tax ${suffix}`, percentage: "18" },
    });
    owned.taxes.push(tax.id);
    const product = await db.product.create({
      data: {
        name: `Flow product ${suffix}`,
        salesPrice: "440",
        costPrice: "0",
        taxes: { connect: { id: tax.id } },
      },
    });
    owned.products.push(product.id);
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        attribute: "Brand",
        value: "Odoo",
        extraPrice: "560",
      },
    });
    const plan = await db.plan.create({
      data: {
        name: `Flow plan ${suffix}`,
        price: "1000",
        billingPeriod: "MONTHLY",
        pausable: true,
        closableEarly: true,
        renewable: true,
        taxes: { connect: { id: tax.id } },
      },
    });
    owned.plans.push(plan.id);
    const productDiscount = await db.discount.create({
      data: {
        name: "Flow product discount",
        type: "PERCENTAGE",
        scope: "PRODUCT",
        value: "10",
        startsAt: new Date(today),
        products: { connect: { id: product.id } },
      },
    });
    owned.discounts.push(productDiscount.id);
    const invoiceDiscount = await db.discount.create({
      data: {
        name: "Flow invoice discount",
        type: "FIXED",
        scope: "SUBSCRIPTION",
        value: "200",
        startsAt: new Date(today),
      },
    });
    owned.discounts.push(invoiceDiscount.id);

    const template = await actor.post("/api/quotation-templates").send({
      name: "Flow template",
      planId: plan.id,
      validityDays: 30,
      lines: [{ productId: product.id, variantId: variant.id, quantity: 1 }],
    });
    expect(template.status).toBe(201);
    owned.templates.push(template.body.data.id);
    const created = await actor.post("/api/subscriptions/from-template").send({
      templateId: template.body.data.id,
      customerId,
      startDate: today,
      paymentTermsDays: 15,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    owned.subs.push(id);
    expect(created.body.data.lines[0].unitPrice).toBe("1000.00");
    for (const to of ["QUOTATION", "CONFIRMED", "ACTIVE"])
      expect(
        (await actor.post(`/api/subscriptions/${id}/transition`).send({ to }))
          .status,
      ).toBe(200);
    const blocked = await actor
      .post("/api/billing/run")
      .send({ asOfDate: "2036-01-01", maxPeriodsPerSubscription: 120 });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.fields.asOfDate).toBeDefined();
    expect(await db.invoice.count({ where: { subscriptionId: id } })).toBe(0);

    const billed = await actor
      .post("/api/billing/run")
      .send({ asOfDate: today });
    expect(billed.status).toBe(200);
    expect(billed.body.data).toMatchObject({ created: 1, failed: 0 });
    expect(
      (await actor.post("/api/billing/run").send({ asOfDate: today })).body.data
        .created,
    ).toBe(0);
    const row = await db.invoice.findFirstOrThrow({
      where: { subscriptionId: id },
    });
    const invoice = await actor.get(`/api/invoices/${row.id}`);
    expect(invoice.status).toBe(200);
    expect(invoice.body.data).toMatchObject({
      subtotal: "2000.00",
      discountTotal: "300.00",
      taxTotal: "306.00",
      total: "2006.00",
    });
    const charge = invoice.body.data.lines.find(
      (line: { productId: string | null }) => line.productId === product.id,
    );
    expect(charge.taxes[0].taxableBase).toBeDefined();
    expect(charge.taxes[0].discounts).toBeDefined();
    const frozen = invoice.body.data;
    const usageBefore = await db.discount.findMany({
      where: { id: { in: owned.discounts } },
      orderBy: { id: "asc" },
      select: { id: true, usedCount: true },
    });
    expect(
      (await actor.post(`/api/invoices/${row.id}/cancel`).send({})).status,
    ).toBe(200);
    const reopened = await actor
      .post(`/api/invoices/${row.id}/reopen`)
      .send({});
    expect(reopened.status).toBe(200);
    expect(reopened.body.data).toEqual({
      ...frozen,
      status: "DRAFT",
      updatedAt: reopened.body.data.updatedAt,
    });
    expect(
      await db.discount.findMany({
        where: { id: { in: owned.discounts } },
        orderBy: { id: "asc" },
        select: { id: true, usedCount: true },
      }),
    ).toEqual(usageBefore);
    expect(
      (await actor.post("/api/billing/run").send({ asOfDate: today })).body.data
        .created,
    ).toBe(0);
    expect(
      (await actor.post(`/api/invoices/${row.id}/confirm`).send({})).status,
    ).toBe(200);
    expect(
      (
        await actor.post("/api/payments").send({
          invoiceId: row.id,
          method: "UPI",
          amount: "500.00",
          date: today,
        })
      ).status,
    ).toBe(201);
    expect(
      (await actor.get(`/api/invoices/${row.id}`)).body.data,
    ).toMatchObject({
      status: "PARTIALLY_PAID",
      amountPaid: "500.00",
      outstanding: "1506.00",
    });
    expect(
      (
        await actor.post("/api/payments").send({
          invoiceId: row.id,
          method: "BANK_TRANSFER",
          amount: "1506.00",
          date: today,
        })
      ).status,
    ).toBe(201);
    expect(
      (await actor.get(`/api/invoices/${row.id}`)).body.data,
    ).toMatchObject({
      status: "PAID",
      amountPaid: "2006.00",
      outstanding: "0.00",
    });

    expect(
      (
        await actor
          .post(`/api/subscriptions/${id}/transition`)
          .send({ to: "PAUSED" })
      ).status,
    ).toBe(200);
    const resumed = await actor
      .post(`/api/subscriptions/${id}/transition`)
      .send({ to: "ACTIVE" });
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.nextInvoiceDate).toBe(invoice.body.data.periodEnd);
    expect(
      (
        await actor
          .post(`/api/subscriptions/${id}/transition`)
          .send({ to: "CLOSED" })
      ).status,
    ).toBe(200);
    const renewed = await actor
      .post(`/api/subscriptions/${id}/transition`)
      .send({ to: "ACTIVE", renewalExpiryDate: addDays(today, 400) });
    expect(renewed.status).toBe(200);
    expect(renewed.body.data.nextInvoiceDate).toBe(invoice.body.data.periodEnd);
    expect(
      (await actor.post("/api/billing/run").send({ asOfDate: today })).body.data
        .created,
    ).toBe(0);
    expect(await db.invoice.count({ where: { subscriptionId: id } })).toBe(1);
    expect(await db.payment.count({ where: { invoiceId: row.id } })).toBe(2);
  }, 20_000);
});
