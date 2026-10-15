import { describe, expect, it } from 'vitest';
import { duplicateInvoiceLines, invoiceCalc, type InvoiceCalcInput } from './invoiceCalc';

const TODAY = '2026-10-12';
const base: InvoiceCalcInput = {
  status: 'Sent',
  dueDate: '2026-10-20',
  discountPct: 0,
  gstRate: 18,
  lines: [{ quantity: 1, unitPricePaise: 100_000_00 }], // ₹1,00,000
  payments: []
};
const calc = (over: Partial<InvoiceCalcInput>) => invoiceCalc({ ...base, ...over }, TODAY);

describe('invoiceCalc', () => {
  it('computes subtotal, GST split and total', () => {
    const t = calc({});
    expect(t.subtotalPaise).toBe(100_000_00);
    expect(t.taxPaise).toBe(18_000_00);
    expect(t.cgstPaise).toBe(9_000_00);
    expect(t.sgstPaise).toBe(9_000_00);
    expect(t.totalPaise).toBe(118_000_00);
    expect(t.balancePaise).toBe(118_000_00);
    expect(t.status).toBe('Sent');
  });

  it('applies the discount before GST', () => {
    const t = calc({ discountPct: 10 });
    expect(t.discountPaise).toBe(10_000_00);
    expect(t.taxablePaise).toBe(90_000_00);
    expect(t.taxPaise).toBe(16_200_00);
    expect(t.totalPaise).toBe(106_200_00);
  });

  it('splits an odd paisa of GST so CGST + SGST always equals the tax', () => {
    const t = calc({ gstRate: 5, lines: [{ quantity: 1, unitPricePaise: 1_01 }] }); // tax 5.05 → 5
    expect(t.cgstPaise + t.sgstPaise).toBe(t.taxPaise);
    const u = calc({ gstRate: 18, lines: [{ quantity: 1, unitPricePaise: 17 }] }); // tax 3.06 → 3
    expect(u.cgstPaise).toBe(2);
    expect(u.sgstPaise).toBe(1);
  });

  it('handles hourly lines with fractional quantities', () => {
    const t = calc({ lines: [{ quantity: 4.5, unitPricePaise: 1_500_00 }], gstRate: 0 });
    expect(t.subtotalPaise).toBe(6_750_00);
  });

  it('is Partially paid after a partial payment before the due date', () => {
    const t = calc({ payments: [{ amountPaise: 50_000_00 }] });
    expect(t.paidPaise).toBe(50_000_00);
    expect(t.balancePaise).toBe(68_000_00);
    expect(t.status).toBe('Partially paid');
  });

  it('is Paid when payments cover the total (overpayment never goes negative)', () => {
    expect(calc({ payments: [{ amountPaise: 118_000_00 }] }).status).toBe('Paid');
    const over = calc({ payments: [{ amountPaise: 100_000_00 }, { amountPaise: 20_000_00 }] });
    expect(over.balancePaise).toBe(0);
    expect(over.status).toBe('Paid');
  });

  it('is Overdue once the due date has passed — even if partly paid', () => {
    expect(calc({ dueDate: '2026-10-11' }).status).toBe('Overdue');
    expect(calc({ dueDate: '2026-10-11', payments: [{ amountPaise: 1_00 }] }).status).toBe('Overdue');
    expect(calc({ dueDate: TODAY }).status).toBe('Sent'); // due today is not overdue yet
  });

  it('keeps Draft and Void as stored, whatever the dates and payments', () => {
    expect(calc({ status: 'Draft', dueDate: '2020-01-01' }).status).toBe('Draft');
    expect(calc({ status: 'Void', dueDate: '2020-01-01' }).status).toBe('Void');
  });
});

describe('duplicateInvoiceLines', () => {
  it('copies text, quantity and price but never the work links', () => {
    const copy = duplicateInvoiceLines([
      { description: 'Feature: Size guide', quantity: 1, unitPricePaise: 42_000_00, workItemId: 'wk_w1' },
      { description: 'Maintenance', quantity: 1, unitPricePaise: 10_000_00, workItemId: null }
    ]);
    expect(copy).toEqual([
      { description: 'Feature: Size guide', quantity: 1, unitPricePaise: 42_000_00, workItemId: null },
      { description: 'Maintenance', quantity: 1, unitPricePaise: 10_000_00, workItemId: null }
    ]);
  });
});
