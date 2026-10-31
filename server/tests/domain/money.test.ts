import { describe, expect, it } from "vitest";
import {
  MAX_MINOR,
  addMinor,
  allocateMinor,
  computeLineTax,
  fromMinor,
  lineSubtotal,
  roundRatio,
  toMinor,
} from "../../src/lib/domain/money.js";
import { priceLine, resolveUnitPrice } from "../../src/lib/domain/price.js";

describe("exact paise arithmetic", () => {
  it("round-trips signed boundaries without floating-point conversion", () => {
    for (const value of [0, 1, -1, 10, 30, MAX_MINOR, -MAX_MINOR])
      expect(toMinor(fromMinor(value))).toBe(value);
    expect(fromMinor(addMinor(toMinor("0.10"), toMinor("0.20")))).toBe("0.30");
  });
  it.each([
    "1",
    "1.1",
    "1.001",
    "01.00",
    "1e2",
    "NaN",
    "Infinity",
    " 1.00",
    "+1.00",
    "1000000000000.00",
  ])("rejects malformed/out-of-range money %s", (value) =>
    expect(() => toMinor(value)).toThrow(),
  );
  it("detects multiplication and sum overflow before persistence", () => {
    expect(() => addMinor(MAX_MINOR, 1)).toThrow();
    expect(() => lineSubtotal(MAX_MINOR, 1_000_000)).toThrow();
    expect(() => fromMinor(0.1)).toThrow();
    expect(() => lineSubtotal(100, 1.5)).toThrow();
  });
  it("rounds half up exactly and independently for each tax", () => {
    expect(computeLineTax(5, "10")).toBe(1);
    expect(computeLineTax(1, "50.0000")).toBe(1);
    expect(computeLineTax(3, "18")).toBe(1);
    expect(computeLineTax(100_000, "18")).toBe(18_000);
    expect(roundRatio(-5n, 10n)).toBe(-1n);
    expect(() => computeLineTax(-1, "18")).toThrow();
    expect(() => computeLineTax(10, "100.0001")).toThrow();
  });
  it("handles intermediate products larger than Number.MAX_SAFE_INTEGER", () => {
    expect(computeLineTax(MAX_MINOR, "100")).toBe(MAX_MINOR);
    expect(computeLineTax(MAX_MINOR, "0")).toBe(0);
  });
  it("allocates every paise with stable ties and no charge overdraft", () => {
    expect(allocateMinor(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocateMinor(100, [0, 100, 100])).toEqual([0, 50, 50]);
    expect(() => allocateMinor(101, [100])).toThrow();
    for (let seed = 1; seed <= 100; seed++) {
      const weights = [seed, seed * 3 + 1, seed * 7 + 2];
      const amount = seed * 5;
      const result = allocateMinor(amount, weights);
      expect(result.reduce((sum, value) => sum + value, 0)).toBe(amount);
      result.forEach((value, index) =>
        expect(value >= 0 && value <= weights[index]!).toBe(true),
      );
    }
  });
});

describe("effective prices", () => {
  it("adds variant price only for inherited unit prices", () => {
    expect(
      resolveUnitPrice({ salesPrice: "1000.00", variantExtraPrice: "560.00" }),
    ).toBe("1560.00");
    expect(
      priceLine({
        salesPrice: "1000.00",
        variantExtraPrice: "560.00",
        unitPrice: "1200.00",
        quantity: 2,
      }),
    ).toEqual({ unitPrice: "1200.00", subtotal: "2400.00" });
  });
});
