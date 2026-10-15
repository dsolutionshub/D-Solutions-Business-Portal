import { z } from 'zod';
import { PAYMENT_METHODS } from '../constants';
import { id, isoDate, optionalText, pastOrToday, positivePaise, requiredText, timestamps } from './common';
import { listQuerySchema } from './api';

/** A payment against one invoice. Partial payments are allowed; the server rejects more than the balance due. */
export const paymentSchema = z.object({
  id,
  /** RCPT-0092 — sequential, assigned by the server. */
  receiptNo: z.string().min(1).max(40),
  invoiceId: id,
  paidOn: pastOrToday,
  method: z.enum(PAYMENT_METHODS),
  reference: requiredText('Enter the UTR or reference number.', 80).min(
    4,
    'Enter the UTR or reference number.'
  ),
  amountPaise: positivePaise,
  note: optionalText(300),
  ...timestamps
});

/** Record a payment. The invoice is given by its number (e.g. INV-2026-0145). */
export const paymentCreateSchema = paymentSchema
  .omit({ id: true, receiptNo: true, invoiceId: true, createdAt: true, updatedAt: true })
  .extend({ invoiceNo: z.string().min(1, 'Select the invoice being paid.').max(40) });

/** Corrections only (date, method, reference, note) — amounts are fixed once recorded. */
export const paymentUpdateSchema = paymentSchema
  .pick({ paidOn: true, method: true, reference: true, note: true })
  .partial();

export const paymentListQuerySchema = listQuerySchema.extend({
  client: id.optional(),
  invoice: z.string().max(40).optional(),
  from: isoDate.optional(),
  to: isoDate.optional()
});

export type Payment = z.infer<typeof paymentSchema>;
export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;
export type PaymentListQuery = z.input<typeof paymentListQuerySchema>;
