/** Other recurring costs of a project (tools, extra domains, app store fees). A next due date gives renewal reminders. */
import { z } from 'zod';
import { BILLING_CYCLES } from '../constants';
import { id, isoDate, paise, requiredText, timestamps } from './common';

export const projectCostSchema = z.object({
  id,
  projectId: id,
  name: requiredText('Name this cost.', 120),
  amountPaise: paise,
  cycle: z.enum(BILLING_CYCLES),
  nextDue: isoDate.nullable(),
  sortOrder: z.number().int().min(0),
  ...timestamps
});

export const projectCostCreateSchema = projectCostSchema.omit({
  id: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true
});

/** POST /api/projects/:id/costs (the project comes from the URL). */
export const projectCostAddSchema = projectCostCreateSchema.omit({ projectId: true });

export const projectCostUpdateSchema = projectCostCreateSchema
  .omit({ projectId: true })
  .extend({ sortOrder: z.number().int().min(0) })
  .partial();

export type ProjectCost = z.infer<typeof projectCostSchema>;
export type ProjectCostCreate = z.infer<typeof projectCostCreateSchema>;
export type ProjectCostAdd = z.infer<typeof projectCostAddSchema>;
export type ProjectCostUpdate = z.infer<typeof projectCostUpdateSchema>;
