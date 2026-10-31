import { describe, expect, it, vi } from "vitest";
import {
  runBillingCycle,
  startBillingScheduler,
} from "../../src/jobs/billing.js";
const result = (extra = {}) => ({
  created: 0,
  skipped: 0,
  failed: 0,
  autoClosed: 0,
  hasMore: false,
  failures: [],
  ...extra,
});

describe("bounded shared-service scheduling", () => {
  it("never starts a disabled scheduler and validates enabled expressions", () => {
    expect(startBillingScheduler({ enabled: false })).toBeNull();
    expect(() =>
      startBillingScheduler({ enabled: true, expression: "not cron" }),
    ).toThrow();
  });
  it("keeps one cutoff and excludes failures while draining other work", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        result({
          failed: 1,
          failures: [
            { subscriptionId: id, code: "INVALID_INVOICE", message: "bad" },
          ],
          hasMore: true,
        }),
      )
      .mockResolvedValueOnce(result({ created: 2 }));
    const summary = await runBillingCycle({ asOfDate: "2026-10-31", run });
    expect(summary).toMatchObject({
      created: 2,
      failed: 1,
      batches: 2,
      hasMore: false,
      stopped: "complete",
    });
    expect(run.mock.calls[1]).toEqual([
      { asOfDate: "2026-10-31" },
      { excludeSubscriptionIds: [id] },
    ]);
  });
  it("stops at a batch cap or lack of progress instead of looping forever", async () => {
    const run = vi
      .fn()
      .mockResolvedValue(result({ created: 1, hasMore: true }));
    expect(
      await runBillingCycle({ asOfDate: "2026-10-31", run, maxBatches: 2 }),
    ).toMatchObject({
      created: 2,
      batches: 2,
      hasMore: true,
      stopped: "budget",
    });
    const stalled = vi
      .fn()
      .mockResolvedValue(result({ skipped: 1, hasMore: true }));
    expect(
      await runBillingCycle({ asOfDate: "2026-10-31", run: stalled }),
    ).toMatchObject({ batches: 1, stopped: "no-progress" });
  });
});
