import { invariant } from "./errors.js";

/** PostgreSQL NUMERIC(14,2): twelve integral rupee digits and two paise digits. */
export const MAX_MINOR = 99_999_999_999_999;
const MAX = BigInt(MAX_MINOR);

export function checkedMinor(value: bigint): number {
  invariant(
    value >= -MAX && value <= MAX,
    "MONEY_OUT_OF_RANGE",
    "Amount exceeds the supported monetary range",
  );
  return Number(value);
}

export function assertMinor(value: number): void {
  invariant(
    Number.isSafeInteger(value) && Math.abs(value) <= MAX_MINOR,
    "MONEY_OUT_OF_RANGE",
    "Money must be integer paise within the supported range",
  );
}

/** Parse decimal digits directly; a negative sign is for internal adjustments only. */
export function toMinor(value: string): number {
  invariant(
    typeof value === "string" && /^-?(0|[1-9]\d{0,11})\.\d{2}$/.test(value),
    "INVALID_MONEY",
    "Money must be a two-place decimal string",
  );
  const negative = value.startsWith("-");
  const [whole, fraction] = (negative ? value.slice(1) : value).split(".");
  const amount = BigInt(whole!) * 100n + BigInt(fraction!);
  return checkedMinor(negative ? -amount : amount);
}

export function fromMinor(value: number): string {
  assertMinor(value);
  const amount = BigInt(value < 0 ? -value : value);
  return `${value < 0 ? "-" : ""}${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}

/** Round magnitude half up, including negative adjustments (away from zero at ties). */
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  invariant(denominator > 0n, "INVALID_RATIO", "Denominator must be positive");
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude + denominator / 2n) / denominator;
  return numerator < 0n ? -rounded : rounded;
}

export function rateUnits(percentage: string): bigint {
  invariant(
    typeof percentage === "string" &&
      /^(0|[1-9]\d{0,2})(\.\d{1,4})?$/.test(percentage),
    "INVALID_RATE",
    "Percentage must have up to four decimal places",
  );
  const [whole, fraction = ""] = percentage.split(".");
  const units = BigInt(whole!) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  invariant(
    units <= 1_000_000n,
    "INVALID_RATE",
    "Percentage must be between zero and 100",
  );
  return units;
}

export function computeLineTax(baseMinor: number, percentage: string): number {
  assertMinor(baseMinor);
  invariant(
    baseMinor >= 0,
    "INVALID_MONEY",
    "A taxable base cannot be negative",
  );
  return checkedMinor(
    roundRatio(BigInt(baseMinor) * rateUnits(percentage), 1_000_000n),
  );
}

export function addMinor(...amounts: number[]): number {
  for (const value of amounts) assertMinor(value);
  return checkedMinor(amounts.reduce((sum, value) => sum + BigInt(value), 0n));
}

export function lineSubtotal(unitMinor: number, quantity: number): number {
  assertMinor(unitMinor);
  invariant(unitMinor >= 0, "INVALID_MONEY", "Unit price cannot be negative");
  invariant(
    Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1_000_000,
    "INVALID_QUANTITY",
    "Quantity must be an integer from 1 to 1000000",
  );
  return checkedMinor(BigInt(unitMinor) * BigInt(quantity));
}

/** Largest remainder allocation; exact sum, stable input-order ties, no over-allocation. */
export function allocateMinor(
  amount: number,
  weights: readonly number[],
): number[] {
  assertMinor(amount);
  invariant(amount >= 0, "INVALID_MONEY", "Allocation cannot be negative");
  for (const value of weights) {
    assertMinor(value);
    invariant(value >= 0, "INVALID_MONEY", "Weights cannot be negative");
  }
  const total = weights.reduce((sum, value) => sum + BigInt(value), 0n);
  invariant(
    BigInt(amount) <= total,
    "INVALID_ALLOCATION",
    "Discount exceeds eligible charges",
  );
  if (total === 0n) return weights.map(() => 0);
  const rows = weights.map((weight, index) => {
    const numerator = BigInt(weight) * BigInt(amount);
    return { index, value: numerator / total, remainder: numerator % total };
  });
  let rest = BigInt(amount) - rows.reduce((sum, row) => sum + row.value, 0n);
  const ordered = [...rows].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const row of ordered)
    if (rest > 0n) {
      row.value += 1n;
      rest -= 1n;
    }
  return rows.map((row) => checkedMinor(row.value));
}
