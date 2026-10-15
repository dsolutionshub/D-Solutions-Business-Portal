import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysUntil, isIsoDate, relativeDays, todayIso } from './dates';
import { formatInr, rupeesToPaise } from './money';

describe('addMonths', () => {
  it('clamps month ends (31 Jan + 1 month → end of Feb)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });
  it('crosses year boundaries and handles leap days', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2026-10-22', 24)).toBe('2028-10-22');
  });
});

describe('day arithmetic', () => {
  it('counts whole days either way', () => {
    expect(daysUntil('2026-10-22', '2026-10-12')).toBe(10);
    expect(daysUntil('2026-09-30', '2026-10-12')).toBe(-12);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(relativeDays('2026-10-13', '2026-10-12')).toBe('in 1 day');
    expect(relativeDays('2026-10-12', '2026-10-12')).toBe('today');
    expect(relativeDays('2026-10-10', '2026-10-12')).toBe('2 days ago');
  });
  it('uses the India date for "today" (UTC evening is already tomorrow in IST)', () => {
    expect(todayIso(new Date('2026-10-11T18:29:00Z'))).toBe('2026-10-11');
    expect(todayIso(new Date('2026-10-11T18:31:00Z'))).toBe('2026-10-12');
  });
  it('validates real calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('8 Oct 2026')).toBe(false);
  });
});

describe('money', () => {
  it('converts rupees to paise without float drift', () => {
    expect(rupeesToPaise(1500)).toBe(150000);
    expect(rupeesToPaise('0.29')).toBe(29);
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise('')).toBeNull();
  });
  it('formats ₹ with Indian grouping, showing paise only when present', () => {
    expect(formatInr(120000_00)).toBe('₹1,20,000');
    expect(formatInr(120000_10)).toBe('₹1,20,000.10');
    expect(formatInr(0)).toBe('₹0');
  });
});
