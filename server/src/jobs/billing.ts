import cron from "node-cron";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import {
  runBilling,
  type BillingInput,
  type BillingResult,
  type BillingRunOptions,
} from "../modules/billing-engine/service.js";
import { dateOnly, parseDate } from "../lib/domain/period.js";
import { invariant } from "../lib/domain/errors.js";

type Runner = (
  input: BillingInput,
  options?: BillingRunOptions,
) => Promise<BillingResult>;
export interface CycleOptions {
  asOfDate: string;
  run?: Runner;
  maxBatches?: number;
  maxDurationMs?: number;
  now?: () => number;
}
export interface CycleResult extends BillingResult {
  batches: number;
  durationMs: number;
  stopped: "complete" | "budget" | "no-progress";
}

/** Fixed cutoff, bounded draining, and failed-ID exclusion prevent starvation/retry loops. */
export async function runBillingCycle(
  options: CycleOptions,
): Promise<CycleResult> {
  parseDate(options.asOfDate);
  const maxBatches = options.maxBatches ?? 10,
    maxDuration = options.maxDurationMs ?? 30_000;
  invariant(
    Number.isInteger(maxBatches) && maxBatches >= 1 && maxBatches <= 100,
    "INVALID_LIMIT",
    "Scheduler batch limit must be from 1 to 100",
  );
  invariant(
    Number.isFinite(maxDuration) && maxDuration > 0 && maxDuration <= 300_000,
    "INVALID_LIMIT",
    "Scheduler time budget is invalid",
  );
  const now = options.now ?? (() => performance.now()),
    start = now(),
    run = options.run ?? runBilling;
  const failedIds = new Set<string>();
  const result: CycleResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    autoClosed: 0,
    hasMore: true,
    failures: [],
    batches: 0,
    durationMs: 0,
    stopped: "budget",
  };
  for (
    let batch = 0;
    batch < maxBatches && now() - start < maxDuration;
    batch++
  ) {
    const next = await run(
      { asOfDate: options.asOfDate },
      { excludeSubscriptionIds: [...failedIds] },
    );
    result.batches++;
    result.created += next.created;
    result.skipped += next.skipped;
    result.failed += next.failed;
    result.autoClosed += next.autoClosed;
    result.hasMore = next.hasMore;
    result.failures.push(...next.failures);
    next.failures.forEach((failure) => failedIds.add(failure.subscriptionId));
    if (!next.hasMore) {
      result.stopped = "complete";
      break;
    }
    if (next.created === 0 && next.autoClosed === 0 && next.failed === 0) {
      result.stopped = "no-progress";
      break;
    }
    if (failedIds.size >= 10_000) break;
  }
  result.durationMs = Math.max(0, now() - start);
  return result;
}

export interface SchedulerOptions {
  enabled: boolean;
  expression?: string;
  run?: Runner;
  today?: () => string;
  log?: (event: Record<string, unknown>) => void;
}

/** No timers are created by importing this module. Startup owns explicit activation. */
export function startBillingScheduler(
  options: SchedulerOptions,
): { stop: () => Promise<void> } | null {
  if (!options.enabled) return null;
  const expression = options.expression ?? "0 0 * * *";
  invariant(
    cron.validate(expression),
    "INVALID_CRON",
    "BILLING_CRON is not a valid cron expression",
  );
  const log = options.log ?? ((event) => console.log(JSON.stringify(event)));
  let inFlight: Promise<void> | undefined;
  const task = cron.schedule(
    expression,
    () => {
      const runId = randomUUID();
      inFlight = (async () => {
        try {
          const asOfDate = (options.today ?? (() => dateOnly(new Date())))();
          const result = await runBillingCycle({ asOfDate, run: options.run });
          log({ event: "billing.completed", runId, asOfDate, ...result });
        } catch {
          // Database errors can contain connection details. Only publish safe diagnostics.
          log({ event: "billing.failed", runId, code: "BILLING_JOB_FAILED" });
        }
      })();
      return inFlight;
    },
    { timezone: "UTC", noOverlap: true, name: "brightloop-billing" },
  );
  return {
    stop: async () => {
      await task.stop();
      await inFlight;
      await task.destroy();
    },
  };
}
