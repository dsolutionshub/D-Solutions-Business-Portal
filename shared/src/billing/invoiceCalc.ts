/**
 * Invoice totals and status (prototype: invCalc in selectors.js), in integer paise.
 *
 *   line       round(quantity × unit price)
 *   discount   round(subtotal × discount% / 100)
 *   tax (GST)  round(taxable × rate / 100), split into CGST + SGST (intra-state); an odd paisa goes to CGST
 *   balance    max(total − paid, 0)
 *   status     Draft and Void are kept as stored. Otherwise:
 *              balance 0 → Paid · past due → Overdue · some paid → Partially paid · else Sent
 */
import type { InvoiceStatus, InvoiceStoredStatus } from '../constants';
import { todayIso, type IsoDate } from '../dates';
import type { InvoiceTotals } from '../schemas/invoice';
import type { InvoiceLineInput } from '../schemas/invoiceLine';

export interface InvoiceCalcInput {
  status: InvoiceStoredStatus;
  dueDate: IsoDate;
  discountPct: number;
  gstRate: number;
  lines: readonly { quantity: number; unitPricePaise: number }[];
  payments: readonly { amountPaise: number }[];
}

export const lineAmountPaise = (l: { quantity: number; unitPricePaise: number }) =>
  Math.round(l.quantity * l.unitPricePaise);

export function invoiceStatus(
  stored: InvoiceStoredStatus,
  balancePaise: number,
  paidPaise: number,
  dueDate: IsoDate,
  today: IsoDate
): InvoiceStatus {
  if (stored === 'Draft' || stored === 'Void') return stored;
  if (balancePaise <= 0) return 'Paid';
  if (dueDate < today) return 'Overdue';
  return paidPaise > 0 ? 'Partially paid' : 'Sent';
}

export function invoiceCalc(inv: InvoiceCalcInput, today: IsoDate = todayIso()): InvoiceTotals {
  const subtotalPaise = inv.lines.reduce((sum, l) => sum + lineAmountPaise(l), 0);
  const discountPaise = Math.round((subtotalPaise * inv.discountPct) / 100);
  const taxablePaise = subtotalPaise - discountPaise;
  const taxPaise = Math.round((taxablePaise * inv.gstRate) / 100);
  const cgstPaise = Math.ceil(taxPaise / 2);
  const sgstPaise = taxPaise - cgstPaise;
  const totalPaise = taxablePaise + taxPaise;
  const paidPaise = inv.payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const balancePaise = Math.max(totalPaise - paidPaise, 0);
  return {
    subtotalPaise,
    discountPaise,
    taxablePaise,
    taxPaise,
    cgstPaise,
    sgstPaise,
    totalPaise,
    paidPaise,
    balancePaise,
    status: invoiceStatus(inv.status, balancePaise, paidPaise, inv.dueDate, today)
  };
}

/**
 * Lines for a duplicated invoice. The copy never re-bills the same delivered work, so the
 * work links are dropped (the text, quantity and price stay).
 */
export function duplicateInvoiceLines(lines: readonly InvoiceLineInput[]): InvoiceLineInput[] {
  return lines.map(({ description, quantity, unitPricePaise }) => ({
    description,
    quantity,
    unitPricePaise,
    workItemId: null
  }));
}
