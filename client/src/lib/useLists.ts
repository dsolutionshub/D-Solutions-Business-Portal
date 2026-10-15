import type { ListKey, ListsResponse } from '@dsol/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Dropdown lists from Settings → Dropdown lists (GET /api/lists). */
export const useLists = () =>
  useQuery({ queryKey: ['lists'], queryFn: () => api.get<ListsResponse>('/lists'), staleTime: 10 * 60_000 });

/**
 * Options for a dropdown: the list's values plus any current value no longer in it,
 * so editing an old record never loses its value.
 */
export function listOptions(
  lists: ListsResponse | undefined,
  key: ListKey,
  ...current: (string | null | undefined)[]
) {
  const base = lists?.[key] ?? [];
  return [...base, ...current.filter((v): v is string => !!v && !base.includes(v))];
}
