/**
 * Calendar-date helpers. Dates are ISO strings (YYYY-MM-DD); "today" is the business day in India,
 * so the Worker (UTC) and every browser agree on what is due or overdue.
 * All arithmetic is done on the calendar date itself — no time zones or DST involved.
 */
export type IsoDate = string;

export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

/** Today's date in IST as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE }).format(now);
}

/** Today's date in another time zone (Settings → reminder time zone). */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** "2026-10" → "Oct 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

const toUtcMs = (iso: IsoDate) => Date.parse(iso + 'T00:00:00Z');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const ms = toUtcMs(v);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}

/** Whole days from `from` to `iso` (negative when `iso` is in the past). */
export function daysUntil(iso: IsoDate, from: IsoDate = todayIso()): number {
  return Math.round((toUtcMs(iso) - toUtcMs(from)) / 86_400_000);
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  return new Date(toUtcMs(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Add calendar months, clamping to the last day of the target month:
 * 31 Jan + 1 → 28 Feb (29 in leap years), 29 Feb 2028 + 12 → 28 Feb 2029.
 * (Plain Date#setMonth would roll 31 Jan + 1 over to 3 Mar.)
 */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = index - year * 12; // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** "in 5 days", "today", "3 days ago". */
export function relativeDays(iso: IsoDate, from: IsoDate = todayIso()): string {
  const d = daysUntil(iso, from);
  if (d === 0) return 'today';
  if (d < 0) return `${-d} ${d === -1 ? 'day' : 'days'} ago`;
  return `in ${d} ${d === 1 ? 'day' : 'days'}`;
}
