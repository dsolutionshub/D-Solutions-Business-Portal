import { describe, expect, it } from 'vitest';
import { duplicateInvoiceLines } from './invoiceCalc';
import { workAmountPaise, workLine, workLinkChanges, workStatus, type WorkPricing } from './workStatus';

const fixed = (amountPaise: number): WorkPricing => ({
  billing: 'Fixed',
  amountPaise,
  hours: 0,
  ratePaise: 0
});
const hourly = (hours: number, ratePaise: number): WorkPricing => ({
  billing: 'Hourly',
  amountPaise: 0,
  hours,
  ratePaise
});
const free: WorkPricing = { billing: 'Free', amountPaise: 99_00, hours: 0, ratePaise: 0 };

describe('workAmountPaise', () => {
  it('uses the fixed amount, hours × rate, or zero when free', () => {
    expect(workAmountPaise(fixed(42_000_00))).toBe(42_000_00);
    expect(workAmountPaise(hourly(4, 1_500_00))).toBe(6_000_00);
    expect(workAmountPaise(hourly(2.5, 1_500_00))).toBe(3_750_00);
    expect(workAmountPaise(free)).toBe(0);
  });
});

describe('workStatus', () => {
  it('Not billable when free, even if invoiced', () => {
    expect(workStatus(free, null)).toBe('Not billable');
    expect(workStatus(free, 'Paid')).toBe('Not billable');
  });

  it('Needs price / To bill when not on an invoice', () => {
    expect(workStatus(fixed(0), null)).toBe('Needs price');
    expect(workStatus(fixed(24_000_00), null)).toBe('To bill');
    expect(workStatus(hourly(3, 1_500_00), null)).toBe('To bill');
    expect(workStatus(hourly(3, 0), null)).toBe('Needs price');
  });

  it('follows the linked invoice', () => {
    const w = fixed(10_000_00);
    expect(workStatus(w, 'Draft')).toBe('In draft');
    expect(workStatus(w, 'Sent')).toBe('Invoiced');
    expect(workStatus(w, 'Partially paid')).toBe('Part paid');
    expect(workStatus(w, 'Overdue')).toBe('Overdue');
    expect(workStatus(w, 'Paid')).toBe('Paid');
  });

  it('goes back to To bill when its invoice is voided', () => {
    expect(workStatus(fixed(10_000_00), 'Void')).toBe('To bill');
    expect(workStatus(fixed(0), 'Void')).toBe('Needs price');
  });
});

describe('workLine', () => {
  it('bills hourly work as hours × rate with the release version', () => {
    expect(
      workLine(
        { id: 'wk_w6', type: 'Bug fix', title: 'PDP image zoom on Safari', ...hourly(4, 1_500_00) },
        'v4.2.0'
      )
    ).toEqual({
      description: 'Bug fix: PDP image zoom on Safari (v4.2.0) — 4 h',
      quantity: 4,
      unitPricePaise: 1_500_00,
      workItemId: 'wk_w6'
    });
  });

  it('bills fixed work as one unit at the amount', () => {
    expect(workLine({ id: 'wk_w5', type: 'Feature', title: 'Wishlist sync', ...fixed(24_000_00) })).toEqual({
      description: 'Feature: Wishlist sync',
      quantity: 1,
      unitPricePaise: 24_000_00,
      workItemId: 'wk_w5'
    });
  });
});

describe('workLinkChanges', () => {
  it('links work on the invoice and unlinks work whose line was removed', () => {
    const lines = [{ workItemId: 'w1' }, { workItemId: 'w3' }, { workItemId: null }];
    expect(workLinkChanges(lines, ['w1', 'w2'])).toEqual({ link: ['w3'], unlink: ['w2'] });
  });

  it('a duplicated invoice links no work (lines have no work ids)', () => {
    const original = [
      { description: 'Feature: A', quantity: 1, unitPricePaise: 100, workItemId: 'w1' },
      { description: 'Feature: B', quantity: 1, unitPricePaise: 100, workItemId: 'w2' }
    ];
    // The copy is a new invoice, so nothing is linked to it yet.
    expect(workLinkChanges(duplicateInvoiceLines(original), [])).toEqual({ link: [], unlink: [] });
  });
});
