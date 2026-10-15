import { z } from 'zod';
import { id, paise, text } from './common';

/** Line amount = round(quantity × unit price). A line from delivered work keeps workItemId. */
export const invoiceLineSchema = z.object({
  id,
  invoiceId: id,
  description: text(300),
  /** Hours for hourly work, so fractions are allowed. */
  quantity: z.number().min(0, 'Quantity cannot be negative.').max(100_000),
  unitPricePaise: paise,
  workItemId: id.nullable(),
  sortOrder: z.number().int().min(0)
});

/** A line as entered on the invoice editor (ids and order are assigned by the server). */
export const invoiceLineInputSchema = invoiceLineSchema.pick({
  description: true,
  quantity: true,
  unitPricePaise: true,
  workItemId: true
});

export const invoiceLineCreateSchema = invoiceLineInputSchema.extend({ invoiceId: id });
export const invoiceLineUpdateSchema = invoiceLineInputSchema
  .extend({ sortOrder: z.number().int().min(0) })
  .partial();

export type InvoiceLine = z.infer<typeof invoiceLineSchema>;
export type InvoiceLineInput = z.infer<typeof invoiceLineInputSchema>;
export type InvoiceLineCreate = z.infer<typeof invoiceLineCreateSchema>;
export type InvoiceLineUpdate = z.infer<typeof invoiceLineUpdateSchema>;
