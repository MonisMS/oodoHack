import { describe, expect, it, vi, beforeEach } from "vitest";

const fake = vi.hoisted(() => ({
  schedule: vi.fn(),
  stop: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("node-cron", () => ({
  default: { validate: () => true, schedule: fake.schedule },
}));
import { startBillingScheduler } from "../../src/jobs/billing.js";

beforeEach(() => {
  fake.stop.mockReset();
  fake.destroy.mockReset();
  fake.schedule.mockReset();
  fake.schedule.mockReturnValue({ stop: fake.stop, destroy: fake.destroy });
});
describe("scheduler startup and graceful shutdown", () => {
  it("uses UTC/noOverlap and waits for an in-flight transaction cycle before destruction", async () => {
    let finish!: (value: {
      created: number;
      skipped: number;
      failed: number;
      autoClosed: number;
      hasMore: boolean;
      failures: never[];
    }) => void;
    const run = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const log = vi.fn();
    const scheduler = startBillingScheduler({
      enabled: true,
      run,
      today: () => "2026-10-31",
      log,
    })!;
    expect(fake.schedule.mock.calls[0]![2]).toMatchObject({
      timezone: "UTC",
      noOverlap: true,
      name: "brightloop-billing",
    });
    const pending = fake.schedule.mock.calls[0]![1]();
    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(fake.stop).toHaveBeenCalledOnce();
    expect(stopped).toBe(false);
    expect(fake.destroy).not.toHaveBeenCalled();
    finish({
      created: 1,
      skipped: 0,
      failed: 0,
      autoClosed: 0,
      hasMore: false,
      failures: [],
    });
    await pending;
    await stopping;
    expect(stopped).toBe(true);
    expect(fake.destroy).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "billing.completed",
        asOfDate: "2026-10-31",
        created: 1,
      }),
    );
  });
  it("logs safe diagnostics when a run fails instead of leaking database error text", async () => {
    const log = vi.fn();
    const scheduler = startBillingScheduler({
      enabled: true,
      run: vi.fn().mockRejectedValue(new Error("private connection details")),
      log,
    })!;
    await fake.schedule.mock.calls[0]![1]();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "billing.failed",
        code: "BILLING_JOB_FAILED",
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private connection");
    await scheduler.stop();
  });
});
