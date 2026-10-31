// Calendar-date helpers. The API speaks `YYYY-MM-DD` strings (UTC); DATE columns come back as UTC-midnight Dates.
export const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
export const parseDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
export const addDays = (s: string, days: number) => dateOnly(new Date(parseDate(s).getTime() + days * 86_400_000));
export const todayUtc = () => dateOnly(new Date());
