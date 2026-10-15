import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export interface SortState {
  id: string;
  dir: 'asc' | 'desc';
}

/**
 * List page state kept in the URL (?q, ?page, ?pageSize, ?sort and filters), so a filtered,
 * sorted page can be bookmarked, shared and survives reloads and the back button.
 * Changing anything but the page resets to page 1.
 */
export function useListParams<F extends string>(opts: {
  sort: string;
  pageSize?: number;
  filters: readonly F[];
}) {
  const [params, setParams] = useSearchParams();
  const defaultPageSize = opts.pageSize ?? 25;
  const filterKeys = opts.filters;

  const state = useMemo(() => {
    const [sid, sdir] = (params.get('sort') ?? opts.sort).split(':');
    const filters = Object.fromEntries(filterKeys.map(k => [k, params.get(k) ?? ''])) as Record<F, string>;
    return {
      q: params.get('q') ?? '',
      page: Math.max(1, Number(params.get('page')) || 1),
      pageSize: Number(params.get('pageSize')) || defaultPageSize,
      sort: { id: sid ?? '', dir: sdir === 'desc' ? 'desc' : 'asc' } as SortState,
      filters
    };
  }, [params, opts.sort, defaultPageSize, filterKeys]);

  const update = useCallback(
    (patch: Record<string, string | number | null | undefined>) =>
      setParams(
        prev => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const clear = useCallback(
    () => update(Object.fromEntries(['q', ...filterKeys].map(k => [k, null]))),
    [update, filterKeys]
  );

  const active = !!state.q || filterKeys.some(k => !!state.filters[k]);

  return {
    ...state,
    active,
    setQ: (q: string) => update({ q }),
    setFilter: (k: F, v: string) => update({ [k]: v }),
    setSort: (s: SortState) => update({ sort: `${s.id}:${s.dir}` }),
    setPage: (page: number) => update({ page: page > 1 ? page : null }),
    setPageSize: (n: number) => update({ pageSize: n === defaultPageSize ? null : n }),
    clear,
    /** Query params for the API call. */
    query: {
      q: state.q || undefined,
      page: state.page,
      pageSize: state.pageSize,
      sort: `${state.sort.id}:${state.sort.dir}`,
      ...state.filters
    }
  };
}
