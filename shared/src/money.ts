/**
 * Money is stored and sent as integer paise (₹1 = 100). Convert only where people type or read it.
 */
import type { IsoDate } from './dates';

export type Paise = number;

/** ₹ amount typed by a person → paise. Rounds to the nearest paisa; empty → null. */
export function rupeesToPaise(rupees: number | string | null | undefined): Paise | null {
  if (rupees === null || rupees === undefined || rupees === '') return null;
  const n = typeof rupees === 'number' ? rupees : Number(rupees);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export const paiseToRupees = (paise: Paise): number => paise / 100;

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,20,000 — or ₹1,20,000.10 when there are paise. Indian digit grouping. */
export function formatInr(paise: Paise | null | undefined): string {
  const p = Math.round(paise ?? 0);
  const sign = p < 0 ? '−' : '';
  const abs = Math.abs(p);
  return sign + '₹' + (abs % 100 === 0 ? whole.format(abs / 100) : exact.format(abs / 100));
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
});

/** 8 Oct 2026 — or an em dash for an empty date. */
export const formatDate = (iso: IsoDate | null | undefined): string =>
  iso ? dateFormat.format(new Date(iso + 'T00:00:00Z')) : '—';
