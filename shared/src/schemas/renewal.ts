/**
 * Renewals: everything with a due date, computed live from the project sheets
 * (domain expiry, SSL expiry, hosting next bill, recurring costs) — plus the log of renewals done.
 */
import { z } from 'zod';
import { BILLING_CYCLES, DUE_STATUSES, RENEWAL_KINDS } from '../constants';
import { id, isoDate, optionalText, paise, requiredText, timestamps } from './common';

/** A due item (computed — server/src/services/renewals.ts). */
export const renewalItemSchema = z.object({
  /** projectId:ref, e.g. "pj_p1:domain" or "pj_p1:cost:pc_x" */
  id: z.string(),
  projectId: id,
  clientId: id,
  projectName: z.string(),
  /** Which sheet field moves forward when renewed: domain | ssl | hosting | cost:<costId> */
  ref: z.string(),
  kind: z.enum(RENEWAL_KINDS),
  name: z.string(),
  provider: z.string().nullable(),
  expiry: isoDate,
  amountPaise: paise,
  cycle: z.enum(BILLING_CYCLES),
  autoRenew: z.boolean().nullable(),
  daysLeft: z.number().int(),
  status: z.enum(DUE_STATUSES)
});

export const renewalHistorySchema = z.object({
  id,
  clientId: id,
  projectId: id.nullable(),
  kind: z.enum(RENEWAL_KINDS).nullable(),
  itemName: requiredText('Item name is required.', 200),
  renewedOn: isoDate,
  amountPaise: paise,
  /** "1 year", "3 months", "90 days" */
  period: requiredText('Period is required.', 40),
  /** A person's name, or "Auto-renew". */
  renewedBy: requiredText('Who renewed it?', 80),
  reference: optionalText(80),
  ...timestamps
});

/** POST /api/renewals/:projectId/:ref/renew — move the date forward n periods and log it. */
export const renewCreateSchema = z.object({
  periods: z.number().int().min(1, 'At least one period.').max(36),
  paidVia: optionalText(60),
  reference: requiredText('Add the order or receipt number for audit.', 80).min(
    4,
    'Add the order or receipt number for audit.'
  ),
  amountPaise: paise
});

/** PATCH /api/projects/:id/auto-renew */
export const autoRenewSchema = z.object({ on: z.boolean() });

export interface RenewResult {
  item: RenewalItem;
  history: RenewalHistory;
}

/** GET /api/projects/:id/renewals */
export interface ProjectRenewals {
  items: RenewalItem[];
  history: (RenewalHistory & { paidVia: string | null })[];
}

export type RenewalItem = z.infer<typeof renewalItemSchema>;
export type RenewalHistory = z.infer<typeof renewalHistorySchema>;
export type RenewCreate = z.infer<typeof renewCreateSchema>;
export type AutoRenew = z.infer<typeof autoRenewSchema>;
