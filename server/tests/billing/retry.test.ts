import { describe, expect, it, vi } from "vitest";
import {
  isInvoicePeriodConflict,
  isRetryableConflict,
  withTransactionRetry,
} from "../../src/modules/billing-engine/retry.js";

describe("database retry classification", () => {
  it("recognizes Prisma and pg-adapter nested deadlock/serialization errors", () => {
    expect(isRetryableConflict({ code: "P2034" })).toBe(true);
    expect(
      isRetryableConflict({
        meta: { driverAdapterError: { cause: { originalCode: "40P01" } } },
      }),
    ).toBe(true);
    expect(isRetryableConflict({ cause: { code: "40001" } })).toBe(true);
    expect(isRetryableConflict({ code: "P2028" })).toBe(false);
  });
  it("does not swallow unrelated uniqueness violations", () => {
    expect(
      isInvoicePeriodConflict({
        code: "P2002",
        meta: { target: ["subscriptionId", "periodStart"] },
      }),
    ).toBe(true);
    expect(
      isInvoicePeriodConflict({
        code: "P2010",
        meta: {
          code: "23505",
          cause: { constraintName: "Invoice_subscriptionId_periodStart_key" },
        },
      }),
    ).toBe(true);
    expect(
      isInvoicePeriodConflict({ code: "P2002", meta: { target: ["number"] } }),
    ).toBe(false);
  });
  it("bounds whole-operation retries and immediately propagates other errors", async () => {
    const transient = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2034" })
      .mockResolvedValue("done");
    expect(await withTransactionRetry(transient, 2)).toBe("done");
    expect(transient).toHaveBeenCalledTimes(2);
    const stuck = vi.fn().mockRejectedValue({ code: "P2034" });
    await expect(withTransactionRetry(stuck, 2)).rejects.toMatchObject({
      code: "RETRY_LIMIT_REACHED",
    });
    expect(stuck).toHaveBeenCalledTimes(2);
    const broken = vi.fn().mockRejectedValue(new Error("unrelated"));
    await expect(withTransactionRetry(broken)).rejects.toThrow("unrelated");
    expect(broken).toHaveBeenCalledTimes(1);
  });
});
