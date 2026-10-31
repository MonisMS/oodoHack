import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildInvoiceDraft } from "../../src/lib/domain/invoice-draft.js";
const url = process.env.CATALOG_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    !/test/i.test(parsed.pathname)
  )
    throw new Error("Catalog tests require an isolated local test database");
}
describe.skipIf(!url)("C catalog administration and SQL reporting", () => {
  let app: Express;
  let db: typeof import("../../src/lib/db.js").db;
  let admin: ReturnType<typeof request.agent>;
  let staff: ReturnType<typeof request.agent>;
  let customer: ReturnType<typeof request.agent>;
  let customerId: string;
  let adminId: string;
  let taxId: string;
  let productId: string;
  let planId: string;
  let discountId: string;
  const tag = "C-" + randomUUID();
  const ids = {
    users: [] as string[],
    products: [] as string[],
    plans: [] as string[],
    taxes: [] as string[],
    discounts: [] as string[],
    subs: [] as string[],
  };
  const product = (extra: object = {}) => ({
    name: tag + " Product",
    type: "SERVICE",
    salesPrice: "1000.00",
    costPrice: "250.00",
    taxIds: [taxId],
    ...extra,
  });
  const plan = (extra: object = {}) => ({
    name: tag + " Plan",
    price: "100.00",
    billingPeriod: "MONTHLY",
    minQuantity: 1,
    autoClose: true,
    closableEarly: true,
    pausable: true,
    renewable: true,
    taxIds: [taxId],
    ...extra,
  });
  const offer = (extra: object = {}) => ({
    name: tag + " Offer",
    type: "PERCENTAGE",
    scope: "PRODUCT",
    value: "10.00",
    startsAt: "2026-01-01",
    productIds: [productId],
    ...extra,
  });
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = "test";
    process.env.DEV_AUTH_ENABLED = "false";
    ({ app } = await import("../../src/app.js"));
    ({ db } = await import("../../src/lib/db.js"));
    const { createCredentialUser } = await import("../../src/lib/auth.js");
    for (const role of ["ADMIN", "STAFF", "CUSTOMER"] as const) {
      const user = await createCredentialUser({
        name: tag + " " + role,
        email: `${role.toLowerCase()}-${tag}@example.test`,
        password: "PartC!Verify9",
        role,
      });
      ids.users.push(user.id);
      if (role === "ADMIN") adminId = user.id;
      if (role === "CUSTOMER") customerId = user.id;
      const agent = request.agent(app);
      expect(
        (
          await agent
            .post("/api/auth/sign-in/email")
            .set("Origin", "http://localhost:5173")
            .send({ email: user.email, password: "PartC!Verify9" })
        ).status,
      ).toBe(200);
      if (role === "ADMIN") admin = agent;
      else if (role === "STAFF") staff = agent;
      else customer = agent;
    }
    const tax = await db.tax.create({
      data: { name: tag + " Tax", percentage: "18" },
    });
    taxId = tax.id;
    ids.taxes.push(taxId);
  });
  afterAll(async () => {
    if (!db) return;
    const invoiceWhere = { subscriptionId: { in: ids.subs } };
    await db.discountUsage.deleteMany({ where: { invoice: invoiceWhere } });
    await db.payment.deleteMany({ where: { invoice: invoiceWhere } });
    await db.invoiceLine.deleteMany({ where: { invoice: invoiceWhere } });
    await db.invoice.deleteMany({ where: invoiceWhere });
    await db.subscription.deleteMany({ where: { id: { in: ids.subs } } });
    await db.discount.deleteMany({ where: { id: { in: ids.discounts } } });
    await db.productVariant.deleteMany({
      where: { productId: { in: ids.products } },
    });
    await db.product.deleteMany({ where: { id: { in: ids.products } } });
    await db.plan.deleteMany({ where: { id: { in: ids.plans } } });
    await db.tax.deleteMany({ where: { id: { in: ids.taxes } } });
    await db.user.deleteMany({ where: { id: { in: ids.users } } });
    await db.$disconnect();
  });
  it("creates products and emits exact decimal DTOs with linked active taxes", async () => {
    const r = await admin.post("/api/products").send(product());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    productId = r.body.data.id;
    ids.products.push(productId);
    expect(r.body.data).toMatchObject({
      salesPrice: "1000.00",
      costPrice: "250.00",
      taxIds: [taxId],
      notes: null,
      variants: [],
      isActive: true,
    });
    expect((await staff.get("/api/products/" + productId)).body.data.id).toBe(
      productId,
    );
  });
  it("enforces staff/customer mutation roles and rejects missing records and bad relations", async () => {
    expect((await staff.post("/api/products").send(product())).status).toBe(
      403,
    );
    expect((await customer.get("/api/products")).status).toBe(403);
    expect((await request(app).get("/api/products")).status).toBe(401);
    expect((await admin.get("/api/products/" + randomUUID())).status).toBe(404);
    expect(
      (await admin.put("/api/products/" + randomUUID()).send(product())).status,
    ).toBe(404);
    const r = await admin
      .post("/api/products")
      .send(product({ taxIds: [randomUUID()] }));
    expect(r.status).toBe(422);
    expect(r.body.error.fields.taxIds).toBeDefined();
  });
  it("creates and edits variants, prevents cross-product edits and preserves effective price exactly once", async () => {
    const created = await admin
      .post(`/api/products/${productId}/variants`)
      .send({ attribute: "Brand", value: "Odoo", extraPrice: "560.00" });
    expect(created.status).toBe(201);
    const variant = created.body.data;
    expect(variant.extraPrice).toBe("560.00");
    const other = await admin
      .post("/api/products")
      .send(product({ name: tag + " Other" }));
    ids.products.push(other.body.data.id);
    expect(
      (
        await admin
          .put(`/api/products/${other.body.data.id}/variants/${variant.id}`)
          .send({ attribute: "Brand", value: "Wrong", extraPrice: "1.00" })
      ).status,
    ).toBe(404);
    expect(
      (
        await admin
          .post(`/api/products/${productId}/variants`)
          .send({ attribute: "Brand", value: "Odoo", extraPrice: "560.00" })
      ).status,
    ).toBe(409);
    expect(
      (
        await admin
          .put(`/api/products/${productId}/variants/${variant.id}`)
          .send({ attribute: "Brand", value: "Odoo", extraPrice: "560.00" })
      ).status,
    ).toBe(200);
    const p = await admin.post("/api/plans").send(plan());
    expect(p.status).toBe(201);
    planId = p.body.data.id;
    ids.plans.push(planId);
    const sub = await staff.post("/api/subscriptions").send({
      customerId,
      planId,
      startDate: "2026-10-01",
      paymentTermsDays: 15,
      lines: [{ productId, variantId: variant.id, quantity: 1 }],
    });
    expect(sub.status, JSON.stringify(sub.body)).toBe(201);
    ids.subs.push(sub.body.data.id);
    expect(sub.body.data.lines[0].unitPrice).toBe("1560.00");
    expect(
      (await admin.delete(`/api/products/${productId}/variants/${variant.id}`))
        .status,
    ).toBe(204);
    expect(
      (await admin.get("/api/products/" + productId)).body.data.variants[0]
        .isActive,
    ).toBe(false);
    expect(
      (await staff.get("/api/subscriptions/" + sub.body.data.id)).body.data
        .lines[0].unitPrice,
    ).toBe("1560.00");
  });
  it("replaces catalog fields, deactivates instead of deleting and keeps historical references", async () => {
    expect(
      (
        await admin.put("/api/products/" + productId).send(
          product({
            notes: "Internal notes",
            salesPrice: "1200.00",
            taxIds: [],
          }),
        )
      ).body.data,
    ).toMatchObject({
      notes: "Internal notes",
      salesPrice: "1200.00",
      taxIds: [],
    });
    expect((await admin.delete("/api/products/" + productId)).status).toBe(204);
    expect(
      (await admin.get("/api/products/" + productId)).body.data.isActive,
    ).toBe(false);
    expect(await db.subscriptionLine.count({ where: { productId } })).toBe(1);
    expect(
      (await admin.put("/api/products/" + productId).send(product())).status,
    ).toBe(200);
  });
  it("validates plan availability/int bounds, replaces flags and keeps existing plan prices frozen", async () => {
    expect(
      (
        await admin
          .post("/api/plans")
          .send(
            plan({ availableFrom: "2026-01-01", availableTo: "2026-01-01" }),
          )
      ).status,
    ).toBe(422);
    expect(
      (await admin.post("/api/plans").send(plan({ minQuantity: 2147483648 })))
        .status,
    ).toBe(422);
    expect(
      (
        await admin.put("/api/plans/" + planId).send(
          plan({
            price: "300.00",
            pausable: false,
            availableFrom: "2026-01-01",
            availableTo: "2027-01-01",
          }),
        )
      ).body.data,
    ).toMatchObject({
      price: "300.00",
      pausable: false,
      availableFrom: "2026-01-01",
    });
    const sub = await db.subscription.findUniqueOrThrow({
      where: { id: ids.subs[0]! },
    });
    expect(sub.planPrice!.toFixed(2)).toBe("100.00");
    expect((await admin.delete("/api/plans/" + planId)).status).toBe(204);
    expect((await staff.get("/api/plans/" + planId)).body.data.isActive).toBe(
      false,
    );
  });
  it("validates active relations and discount scopes, rejects supplied counters and preserves usage", async () => {
    const invalid = await admin
      .post("/api/discounts")
      .send(offer({ productIds: [randomUUID()] }));
    expect(invalid.status).toBe(422);
    expect(
      (await admin.post("/api/discounts").send(offer({ productIds: [] })))
        .status,
    ).toBe(422);
    expect(
      (await admin.post("/api/discounts").send(offer({ usedCount: 0 }))).status,
    ).toBe(422);
    expect((await staff.post("/api/discounts").send(offer())).status).toBe(403);
    const r = await admin.post("/api/discounts").send(offer({ usageLimit: 3 }));
    expect(r.status).toBe(201);
    discountId = r.body.data.id;
    ids.discounts.push(discountId);
    await db.discount.update({
      where: { id: discountId },
      data: { usedCount: 2 },
    });
    expect(
      (
        await admin
          .put("/api/discounts/" + discountId)
          .send(offer({ usageLimit: 1 }))
      ).body.error.fields.usageLimit,
    ).toBeDefined();
    const updated = await admin
      .put("/api/discounts/" + discountId)
      .send(offer({ scope: "SUBSCRIPTION", productIds: [], usageLimit: 5 }));
    expect(updated.body.data).toMatchObject({
      usedCount: 2,
      usageLimit: 5,
      productIds: [],
    });
    expect((await admin.delete("/api/discounts/" + discountId)).status).toBe(
      204,
    );
    expect(
      (await staff.get("/api/discounts/" + discountId)).body.data,
    ).toMatchObject({ usedCount: 2, isActive: false });
  });
  it("searches literal wildcard characters, sorts stably, paginates and rejects unsupported sort fields", async () => {
    for (const name of [tag + "% literal", tag + "X normal"]) {
      const r = await admin.post("/api/products").send(product({ name }));
      ids.products.push(r.body.data.id);
    }
    const literal = await staff
      .get("/api/products")
      .query({ search: tag + "%", sortBy: "name" });
    expect(literal.body.data.map((p: { name: string }) => p.name)).toEqual([
      tag + "% literal",
    ]);
    const page = await staff.get("/api/products").query({
      search: tag,
      pageSize: 1,
      page: 2,
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(page.body.data).toHaveLength(1);
    expect(page.body.total).toBeGreaterThan(2);
    for (const path of ["products", "plans", "discounts"])
      expect(
        (await staff.get("/api/" + path).query({ sortBy: "dueDate" })).status,
      ).toBe(422);
  });
  it("calculates report revenue from payment dates, open balances from invoice dates, and applies every filter without fan-out", async () => {
    const p = await db.plan.create({
      data: { name: tag + " Reporting", price: "0", billingPeriod: "MONTHLY" },
    });
    ids.plans.push(p.id);
    const sub = await db.subscription.create({
      data: {
        number: tag + "/report",
        customerId,
        planId: p.id,
        status: "ACTIVE",
        startDate: new Date("2026-01-01"),
        nextInvoiceDate: new Date("2026-04-01"),
        billingAnchorDay: 1,
        billingAnchorMonth: 1,
      },
    });
    ids.subs.push(sub.id);
    const draft = buildInvoiceDraft({
      periodStart: "2026-01-01",
      charges: [
        {
          description: "Service",
          productId: null,
          quantity: 1,
          unitPrice: "100.00",
          taxes: [],
        },
      ],
      discounts: [],
    });
    const create = async (
      status: "CONFIRMED" | "PARTIALLY_PAID" | "PAID" | "DRAFT" | "CANCELLED",
      month: string,
      paid = "0.00",
    ) =>
      db.invoice.create({
        data: {
          number: tag + "/INV/" + month,
          subscriptionId: sub.id,
          customerId,
          status,
          periodStart: new Date(`2026-${month}-01`),
          periodEnd: new Date(`2026-${month}-28`),
          issueDate: new Date("2026-01-10"),
          dueDate: new Date("2026-01-20"),
          customerName: "Report customer",
          customerEmail: "report@example.test",
          subtotal: draft.subtotal,
          total: draft.total,
          taxTotal: draft.taxTotal,
          discountTotal: draft.discountTotal,
          amountPaid: paid,
        },
      });
    const a = await create("PARTIALLY_PAID", "01", "40.00");
    const b = await create("PAID", "02", "100.00");
    await create("DRAFT", "03");
    await create("CANCELLED", "04");
    await create("CONFIRMED", "05");
    await db.payment.createMany({
      data: [
        {
          invoiceId: a.id,
          recordedById: adminId,
          method: "UPI",
          amount: "10.00",
          date: new Date("2026-02-01"),
        },
        {
          invoiceId: a.id,
          recordedById: adminId,
          method: "CASH",
          amount: "30.00",
          date: new Date("2026-02-02"),
        },
        {
          invoiceId: b.id,
          recordedById: adminId,
          method: "BANK_TRANSFER",
          amount: "100.00",
          date: new Date("2026-03-01"),
        },
      ],
    });
    const base = { customerId, planId: p.id, status: "ACTIVE" };
    const all = await staff.get("/api/reports/summary").query(base);
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(all.body.data).toEqual({
      activeSubscriptions: 1,
      revenueCollected: "140.00",
      outstanding: "160.00",
      overdueCount: 2,
      overdueAmount: "160.00",
      revenueByMonth: [
        { month: "2026-02", amount: "40.00" },
        { month: "2026-03", amount: "100.00" },
      ],
    });
    const feb = await staff
      .get("/api/reports/summary")
      .query({ ...base, from: "2026-02-01", to: "2026-02-28" });
    expect(feb.body.data).toEqual({
      activeSubscriptions: 0,
      revenueCollected: "40.00",
      outstanding: "0.00",
      overdueCount: 0,
      overdueAmount: "0.00",
      revenueByMonth: [{ month: "2026-02", amount: "40.00" }],
    });
    for (const filter of [
      { planId: randomUUID() },
      { customerId: randomUUID() },
      { status: "PAUSED" },
    ]) {
      const r = await staff
        .get("/api/reports/summary")
        .query({ ...base, ...filter });
      expect(r.body.data).toEqual({
        activeSubscriptions: 0,
        revenueCollected: "0.00",
        outstanding: "0.00",
        overdueCount: 0,
        overdueAmount: "0.00",
        revenueByMonth: [],
      });
    }
    expect((await customer.get("/api/reports/summary")).status).toBe(403);
    expect(
      (
        await staff
          .get("/api/reports/summary")
          .query({ from: "2026-02-01", to: "2026-01-01" })
      ).status,
    ).toBe(422);
  });
  it("rejects PostgreSQL-unsupported year zero with field errors before any catalog/report SQL", async () => {
    const p = await admin
      .post("/api/plans")
      .send(plan({ availableFrom: "0000-01-01" }));
    expect(p.status).toBe(422);
    expect(p.body.error.fields.availableFrom).toBeDefined();
    const d = await admin
      .post("/api/discounts")
      .send(offer({ startsAt: "0000-01-01" }));
    expect(d.status).toBe(422);
    expect(d.body.error.fields.startsAt).toBeDefined();
    for (const field of ["from", "to"]) {
      const r = await staff
        .get("/api/reports/summary")
        .query({ [field]: "0000-01-01" });
      expect(r.status).toBe(422);
      expect(r.body.error.fields[field]).toBeDefined();
    }
  });
});
