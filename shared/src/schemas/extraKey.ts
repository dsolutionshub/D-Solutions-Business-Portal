/**
 * "Other keys" on a project: search, CDN, marketplace or app keys that don't fit the sheet.
 * A secret extra key is stored encrypted and, like sheet secrets, only read via reveal.
 */
import { z } from 'zod';
import { id, requiredText, timestamps } from './common';

export const extraKeySchema = z.object({
  id,
  projectId: id,
  label: requiredText('Name this key.', 120),
  isSecret: z.boolean(),
  /** The value for non-secret keys; always null for secret keys (use reveal). */
  value: z.string().nullable(),
  hasValue: z.boolean(),
  sortOrder: z.number().int().min(0),
  ...timestamps
});

export const extraKeyCreateSchema = z.object({
  projectId: id,
  label: extraKeySchema.shape.label,
  isSecret: z.boolean(),
  value: z.string().min(1, 'Enter a value.').max(4000)
});

export const extraKeyUpdateSchema = extraKeyCreateSchema
  .omit({ projectId: true })
  .extend({ sortOrder: z.number().int().min(0) })
  .partial();

export type ExtraKey = z.infer<typeof extraKeySchema>;
export type ExtraKeyCreate = z.infer<typeof extraKeyCreateSchema>;
export type ExtraKeyUpdate = z.infer<typeof extraKeyUpdateSchema>;
