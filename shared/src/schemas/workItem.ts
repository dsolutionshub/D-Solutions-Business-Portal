/**
 * Delivered work — one fix, feature, change request or support task we may bill for.
 * Its billing status is derived from the linked invoice and never stored
 * (server/src/services/workStatus.ts).
 */
import { z } from 'zod';
import { BILLING_MODES, WORK_STATUSES, WORK_TYPES } from '../constants';
import { id, isoDate, optionalText, paise, requiredText, timestamps } from './common';

const hours = z.number().min(0, 'Hours cannot be negative.').max(10_000);

const workFields = {
  projectId: id,
  releaseId: id.nullable(),
  type: z.enum(WORK_TYPES),
  title: requiredText('Describe what was delivered.', 200).min(3, 'Describe what was delivered.'),
  deliveredOn: isoDate,
  billing: z.enum(BILLING_MODES),
  /** Fixed price (Fixed billing). 0 = not priced yet. */
  amountPaise: paise,
  /** Hourly billing. */
  hours,
  ratePaise: paise,
  note: optionalText(300)
};

const checkHourly = (w: { billing?: string; hours?: number; ratePaise?: number }, ctx: z.RefinementCtx) => {
  if (w.billing !== 'Hourly') return;
  if (!(Number(w.hours) > 0)) ctx.addIssue({ code: 'custom', path: ['hours'], message: 'Enter the hours.' });
  if (!(Number(w.ratePaise) > 0))
    ctx.addIssue({ code: 'custom', path: ['ratePaise'], message: 'Enter the rate.' });
};

export const workItemSchema = z.object({
  id,
  ...workFields,
  invoiceId: id.nullable(),
  ...timestamps
});

/** As returned by the API: plus the amount to bill and the derived status. */
export const workItemViewSchema = workItemSchema.extend({
  billablePaise: paise,
  status: z.enum(WORK_STATUSES)
});

export const workItemCreateSchema = z.object(workFields).superRefine(checkHourly);
export const workItemUpdateSchema = z
  .object(workFields)
  .omit({ projectId: true })
  .partial()
  .superRefine(checkHourly);

export type WorkItem = z.infer<typeof workItemSchema>;
export type WorkItemView = z.infer<typeof workItemViewSchema>;
export type WorkItemCreate = z.infer<typeof workItemCreateSchema>;
export type WorkItemUpdate = z.infer<typeof workItemUpdateSchema>;
