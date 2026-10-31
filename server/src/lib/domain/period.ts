import { invariant } from "./errors.js";

export type DateOnly = string;
export type BillingPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export interface BillingAnchor {
  day: number;
  month: number;
}
const DAY = 86_400_000;

export function parseDate(value: DateOnly): Date {
  invariant(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value >= "0001-01-01",
    "INVALID_DATE",
    "Expected a calendar date YYYY-MM-DD in years 0001–9999",
  );
  const result = new Date(`${value}T00:00:00.000Z`);
  invariant(
    Number.isFinite(result.getTime()) &&
      result.toISOString().slice(0, 10) === value,
    "INVALID_DATE",
    "Calendar date does not exist",
  );
  return result;
}

export function dateOnly(value: Date): DateOnly {
  invariant(
    Number.isFinite(value.getTime()),
    "INVALID_DATE",
    "Date is invalid",
  );
  const result = value.toISOString().slice(0, 10);
  parseDate(result);
  return result;
}

export function addDays(value: DateOnly, days: number): DateOnly {
  invariant(
    Number.isSafeInteger(days) && Math.abs(days) <= 3_652_059,
    "INVALID_DATE",
    "Day offset is out of range",
  );
  return dateOnly(new Date(parseDate(value).getTime() + days * DAY));
}

function makeDate(year: number, month: number, day: number): DateOnly {
  invariant(
    year >= 1 && year <= 9999 && month >= 1 && month <= 12,
    "INVALID_DATE",
    "Billing date exceeds the supported calendar",
  );
  const last = new Date(0);
  last.setUTCFullYear(year, month, 0);
  const result = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(day, last.getUTCDate())).padStart(2, "0")}`;
  parseDate(result);
  return result;
}

export function anchorFor(value: DateOnly): BillingAnchor {
  const date = parseDate(value);
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1 };
}

export function nextBillingDate(
  value: DateOnly,
  period: BillingPeriod,
  anchor: BillingAnchor = anchorFor(value),
): DateOnly {
  const current = parseDate(value);
  invariant(
    Number.isInteger(anchor.day) &&
      anchor.day >= 1 &&
      anchor.day <= 31 &&
      Number.isInteger(anchor.month) &&
      anchor.month >= 1 &&
      anchor.month <= 12,
    "INVALID_ANCHOR",
    "Billing anchor is invalid",
  );
  if (period === "DAILY") return addDays(value, 1);
  if (period === "WEEKLY") return addDays(value, 7);
  if (period === "MONTHLY") {
    const monthIndex =
      current.getUTCFullYear() * 12 + current.getUTCMonth() + 1;
    return makeDate(
      Math.floor(monthIndex / 12),
      (monthIndex % 12) + 1,
      anchor.day,
    );
  }
  invariant(
    period === "YEARLY",
    "INVALID_PERIOD",
    "Unsupported billing period",
  );
  return makeDate(current.getUTCFullYear() + 1, anchor.month, anchor.day);
}

export interface BillablePeriod {
  start: DateOnly;
  end: DateOnly;
  nextDate: DateOnly;
}
export interface PeriodInput {
  nextInvoiceDate: DateOnly;
  period: BillingPeriod;
  asOfDate: DateOnly;
  expiryDate?: DateOnly | null;
  anchor: BillingAnchor;
  max?: number;
}

export function billingPeriods(input: PeriodInput): {
  periods: BillablePeriod[];
  nextInvoiceDate: DateOnly;
  hasMore: boolean;
} {
  parseDate(input.nextInvoiceDate);
  parseDate(input.asOfDate);
  if (input.expiryDate) parseDate(input.expiryDate);
  const max = input.max ?? 24;
  invariant(
    Number.isInteger(max) && max >= 1 && max <= 120,
    "INVALID_LIMIT",
    "Period cap must be from 1 to 120",
  );
  let cursor = input.nextInvoiceDate;
  const due = () =>
    cursor <= input.asOfDate &&
    (!input.expiryDate || cursor <= input.expiryDate);
  const periods: BillablePeriod[] = [];
  while (due() && periods.length < max) {
    const next = nextBillingDate(cursor, input.period, input.anchor);
    invariant(next > cursor, "INVALID_ANCHOR", "Billing cursor must advance");
    const end =
      input.expiryDate && input.expiryDate < next
        ? addDays(input.expiryDate, 1)
        : next;
    periods.push({ start: cursor, end, nextDate: next });
    cursor = next;
  }
  return { periods, nextInvoiceDate: cursor, hasMore: due() };
}
