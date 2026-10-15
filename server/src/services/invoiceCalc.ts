/** Invoice totals and status — the implementation lives in @dsol/shared so the invoice editor's live preview uses the same code. */
export {
  duplicateInvoiceLines,
  invoiceCalc,
  invoiceStatus,
  lineAmountPaise,
  type InvoiceCalcInput
} from '@dsol/shared';
