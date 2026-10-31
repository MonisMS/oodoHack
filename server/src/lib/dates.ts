import { env } from './env.js';

// Calendar-date helpers. The API speaks `YYYY-MM-DD` strings (UTC); DATE columns come back as UTC-midnight Dates.
export const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
export const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const addDays = (s: string, days: number) => dateOnly(new Date(parseDate(s).getTime() + days * 86_400_000));
export const todayUtc = () => dateOnly(new Date());

/**
 * "Today" for the business, in BUSINESS_TZ (default Asia/Kolkata). Payment dates, overdue checks and pause/close
 * decisions use this so staff in India are not told that today's date is "in the future" between 00:00 and 05:30 IST.
 * Stored dates stay plain calendar dates; todayUtc stays for places that really mean UTC.
 */
export const todayBusiness = (now: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: env.BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
