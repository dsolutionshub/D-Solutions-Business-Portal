/**
 * Dropdown list values (Settings → Dropdown lists). Records store the value as text, so removing a
 * value from a list never changes records that already use it.
 */
import { z } from 'zod';
import { LIST_KEYS } from '../constants';
import { id, requiredText, timestamps } from './common';

export const listKey = z.enum(LIST_KEYS);

export const listValueSchema = z.object({
  id,
  listKey,
  value: requiredText('Type a value first.', 80),
  sortOrder: z.number().int().min(0),
  ...timestamps
});

/** Environment codes are upper-cased letters, digits and dashes (e.g. UAT). */
export const listValueCreateSchema = z
  .object({ listKey, value: listValueSchema.shape.value })
  .transform(v =>
    v.listKey === 'environments' ? { ...v, value: v.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') } : v
  )
  .refine(v => v.value.length > 0, { path: ['value'], message: 'Type a value first.' });

/** POST /api/lists/:key */
export const listAddSchema = z.object({ value: listValueSchema.shape.value });

/** POST /api/lists/:key/reorder — the list's values in their new order (same values, no more, no less). */
export const listReorderSchema = z.object({ values: z.array(z.string().min(1).max(80)).min(1).max(500) });

/** GET /api/lists/:key/:value/usage */
export interface ListUsage {
  count: number;
  /** e.g. "3 projects, 2 releases" */
  detail: string;
}

/** Rename or reorder. */
export const listValueUpdateSchema = z
  .object({ value: listValueSchema.shape.value, sortOrder: z.number().int().min(0) })
  .partial();

/** GET /lists → every list's values in order. */
export const listsResponseSchema = z.record(listKey, z.array(z.string()));

export type ListValue = z.infer<typeof listValueSchema>;
export type ListValueCreate = z.input<typeof listValueCreateSchema>;
export type ListValueUpdate = z.infer<typeof listValueUpdateSchema>;
export type ListAdd = z.infer<typeof listAddSchema>;
export type ListReorder = z.infer<typeof listReorderSchema>;
export type ListsResponse = z.infer<typeof listsResponseSchema>;
