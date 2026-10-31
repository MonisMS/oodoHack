import { describe, expect, it } from "vitest";
import {
  addDays,
  anchorFor,
  billingPeriods,
  nextBillingDate,
  parseDate,
} from "../../src/lib/domain/period.js";

describe("anchored calendar periods", () => {
  it.each([
    ["2026-01-31", "2026-02-28", "2026-03-31"],
    ["2028-01-31", "2028-02-29", "2028-03-31"],
  ])("preserves the original month-end anchor from %s", (start, feb, march) => {
    const anchor = anchorFor(start);
    expect(nextBillingDate(start, "MONTHLY", anchor)).toBe(feb);
    expect(nextBillingDate(feb, "MONTHLY", anchor)).toBe(march);
  });
  it("preserves leap-day yearly anchors across four years", () => {
    const anchor = anchorFor("2024-02-29");
    let date = "2024-02-29";
    for (const expected of [
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]) {
      date = nextBillingDate(date, "YEARLY", anchor);
      expect(date).toBe(expected);
    }
  });
  it("uses UTC calendar days across year and DST boundaries", () => {
    expect(nextBillingDate("2026-12-31", "DAILY")).toBe("2027-01-01");
    expect(nextBillingDate("2026-12-31", "WEEKLY")).toBe("2027-01-07");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(nextBillingDate("0001-01-31", "MONTHLY")).toBe("0001-02-28");
  });
  it.each([
    "2025-02-29",
    "2026-04-31",
    "2026-1-01",
    "0000-01-01",
    "2026-01-01T00:00:00Z",
  ])("rejects invalid date %s", (value) =>
    expect(() => parseDate(value)).toThrow(),
  );
  it("caps catch-up without skipping periods", () => {
    const args = {
      nextInvoiceDate: "2026-01-31",
      period: "MONTHLY" as const,
      anchor: anchorFor("2026-01-31"),
      asOfDate: "2026-05-31",
      max: 2,
    };
    const first = billingPeriods(args);
    expect(first.periods.map((p) => p.start)).toEqual([
      "2026-01-31",
      "2026-02-28",
    ]);
    expect(first.hasMore).toBe(true);
    const second = billingPeriods({
      ...args,
      nextInvoiceDate: first.nextInvoiceDate,
      max: 24,
    });
    expect(second.periods.map((p) => p.start)).toEqual([
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
    expect(second.hasMore).toBe(false);
  });
  it("includes expiry, clips exclusive end, and advances to the natural boundary", () => {
    const result = billingPeriods({
      nextInvoiceDate: "2026-01-01",
      period: "MONTHLY",
      anchor: anchorFor("2026-01-01"),
      asOfDate: "2026-12-31",
      expiryDate: "2026-02-01",
    });
    expect(result.periods).toEqual([
      { start: "2026-01-01", end: "2026-02-01", nextDate: "2026-02-01" },
      { start: "2026-02-01", end: "2026-02-02", nextDate: "2026-03-01" },
    ]);
    expect(result.nextInvoiceDate).toBe("2026-03-01");
    expect(result.hasMore).toBe(false);
  });
  it("returns no work for future or beyond-expiry cursors", () => {
    for (const expiryDate of [undefined, "2026-01-01"])
      expect(
        billingPeriods({
          nextInvoiceDate: "2026-02-01",
          period: "MONTHLY",
          anchor: anchorFor("2026-02-01"),
          asOfDate: "2026-01-01",
          expiryDate,
        }).periods,
      ).toEqual([]);
  });
});
