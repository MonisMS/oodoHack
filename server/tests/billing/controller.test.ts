import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import { DomainError } from "../../src/lib/domain/errors.js";
import express from "express";
import { errorHandler } from "../../src/lib/errors.js";

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../src/modules/billing-engine/service.js", () => ({
  runBilling: run,
}));
let app: Express;
const identity = {
  "x-dev-user-id": "00000000-0000-4000-8000-000000000001",
  "x-dev-role": "STAFF",
};
beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DEV_AUTH_ENABLED = "true";
  process.env.BUSINESS_TZ = "Asia/Kolkata";
  ({ app } = await import("../../src/app.js"));
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T18:45:00Z"));
  run.mockReset();
  run.mockResolvedValue({
    created: 1,
    skipped: 0,
    failed: 0,
    autoClosed: 0,
    hasMore: false,
    failures: [],
  });
});

afterEach(() => vi.useRealTimers());

describe("billing HTTP boundary", () => {
  it("maps invalid transitions and active billing backlog to HTTP 409", async () => {
    const serviceApp = express();
    serviceApp.get("/:code", (req, _res, next) =>
      next(new DomainError(req.params.code, "Action blocked")),
    );
    serviceApp.use(errorHandler);
    for (const code of [
      "INVALID_TRANSITION",
      "BILLING_BACKLOG",
      "SCHEDULE_RECONCILIATION_REQUIRED",
    ]) {
      const response = await request(serviceApp).get(`/${code}`);
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(code);
    }
  });
  it("accepts staff/admin, returns the contract envelope and passes parsed defaults", async () => {
    const result = await request(app)
      .post("/api/billing/run")
      .set(identity)
      .send({ asOfDate: "2026-10-31" });
    expect(result.status).toBe(200);
    expect(result.body.data.created).toBe(1);
    expect(run).toHaveBeenCalledWith({
      asOfDate: "2026-10-31",
      maxPeriodsPerSubscription: 24,
    });
    expect(
      (
        await request(app)
          .post("/api/billing/run")
          .set({ ...identity, "x-dev-role": "ADMIN" })
          .send({ asOfDate: "2026-10-31" })
      ).status,
    ).toBe(200);
  });
  it("rejects customers, missing identity and malformed input before billing", async () => {
    expect(
      (
        await request(app)
          .post("/api/billing/run")
          .set({ ...identity, "x-dev-role": "CUSTOMER" })
          .send({ asOfDate: "2026-10-31" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/billing/run")
          .send({ asOfDate: "2026-10-31" })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/billing/run")
          .set(identity)
          .send({ asOfDate: "2026-10-31", maxPeriodsPerSubscription: 121 })
      ).status,
    ).toBe(422);
    expect(run).not.toHaveBeenCalled();
  });
  it("reports unsupported calendar dates as field errors instead of database failures", async () => {
    run.mockRejectedValue(
      new DomainError("INVALID_DATE", "Calendar is out of range"),
    );
    const result = await request(app)
      .post("/api/billing/run")
      .set(identity)
      .send({ asOfDate: "0000-01-01" });
    expect(result.status).toBe(422);
    expect(result.body.error.fields.asOfDate).toEqual([
      "Calendar is out of range",
    ]);
  });
  it("rejects future dates before invoking billing, including the reported 2036 typo", async () => {
    for (const asOfDate of ["2026-11-02", "2036-01-01"]) {
      const result = await request(app)
        .post("/api/billing/run")
        .set(identity)
        .send({ asOfDate, maxPeriodsPerSubscription: 120 });
      expect(result.status).toBe(422);
      expect(result.body.error.code).toBe("VALIDATION_ERROR");
      expect(result.body.error.fields.asOfDate).toBeDefined();
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("accepts today's business date after midnight IST even when UTC is yesterday", async () => {
    const result = await request(app)
      .post("/api/billing/run")
      .set(identity)
      .send({ asOfDate: "2026-11-01" });
    expect(result.status).toBe(200);
    expect(run).toHaveBeenCalledWith({
      asOfDate: "2026-11-01",
      maxPeriodsPerSubscription: 24,
    });
  });
});
