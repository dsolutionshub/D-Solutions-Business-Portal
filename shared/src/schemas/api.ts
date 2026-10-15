/** Conventions shared by every list endpoint: ?page, ?pageSize, ?q, ?sort=field:asc|desc */
import { z } from 'zod';

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform(v => v || undefined),
  sort: z
    .string()
    .regex(/^[a-zA-Z]+:(asc|desc)$/, 'Sort like name:asc')
    .optional()
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const paginatedSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1)
  });

/** Parse "field:dir" against the allowed fields; falls back when missing or unknown. */
export function parseSort<K extends string>(
  sort: string | undefined,
  allowed: readonly K[],
  fallback: { key: K; dir: 'asc' | 'desc' }
): { key: K; dir: 'asc' | 'desc' } {
  const [key, dir] = (sort ?? '').split(':');
  return (allowed as readonly string[]).includes(key ?? '') && (dir === 'asc' || dir === 'desc')
    ? { key: key as K, dir }
    : fallback;
}
