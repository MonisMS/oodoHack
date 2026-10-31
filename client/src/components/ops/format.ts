// Display helpers for the operational screens. Money arrives from the API as exact decimal strings and is only formatted here,
// never calculated: every total, tax and balance shown comes from the server.
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export const money = (value: string | null | undefined) => (value === null || value === undefined || value === '' ? '—' : rupees.format(Number(value)));

/** `YYYY-MM-DD` (a calendar date, no time zone) to "31 Oct 2026". */
export const date = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');

export const dateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** SCREAMING_SNAKE enum to "Screaming snake". */
export const label = (value: string) => { const text = value.replace(/_/g, ' ').toLowerCase(); return text.charAt(0).toUpperCase() + text.slice(1); };

/** Today in the business calendar (Asia/Kolkata, matching the server's default BUSINESS_TZ) as `YYYY-MM-DD`. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const addDays = (isoDate: string, days: number) => new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export const BILLING_PERIOD_LABEL = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' } as const;
