import { PAGE_SIZES } from '@dsol/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { SortState } from '@/lib/useListParams';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { NativeSelect } from './NativeSelect';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Sortable on the server by this column id. */
  sortable?: boolean;
  align?: 'left' | 'right';
  /** Allow text to wrap. Cells don't wrap by default (the table scrolls sideways instead). */
  wrap?: boolean;
  className?: string;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

/**
 * Table with sortable headers, pagination, loading skeleton rows, empty and error states.
 * Sorting and paging are controlled (the server does the work). On narrow screens the table
 * scrolls inside its card, never the page.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  onRetry,
  empty,
  sort,
  onSortChange,
  pagination,
  label
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  pagination?: PaginationState;
  /** Accessible name of the table. */
  label?: string;
}) {
  if (error && !rows) return <ErrorState error={error} onRetry={onRetry} />;
  const list = rows ?? [];
  const showSkeleton = loading && !rows;

  return (
    <>
      <div className="relative overflow-x-auto">
        <table
          className="w-full border-collapse text-[13px]"
          aria-label={label}
          aria-busy={loading || undefined}
        >
          <thead>
            <tr>
              {columns.map(c => {
                const active = sort?.id === c.id;
                const Arrow = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn(
                      'whitespace-nowrap border-b bg-surface-2 px-3.5 py-2.5 text-xs font-medium text-muted-foreground',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      c.className
                    )}
                  >
                    {c.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSortChange({ id: c.id, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded hover:text-foreground',
                          active && 'text-foreground'
                        )}
                      >
                        {c.header}
                        <Arrow className="size-3 opacity-70" aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={cn(loading && rows && 'opacity-60 transition-opacity')}>
            {showSkeleton
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    {columns.map(c => (
                      <td key={c.id} className="border-b px-3.5 py-3.5">
                        <Skeleton className="h-3 w-full min-w-12" />
                      </td>
                    ))}
                  </tr>
                ))
              : list.map(row => (
                  <tr key={getRowId(row)} className="hover:bg-surface-2 [&:last-child>td]:border-b-0">
                    {columns.map(c => (
                      <td
                        key={c.id}
                        className={cn(
                          'border-b px-3.5 py-2.5 align-middle',
                          c.wrap ? 'min-w-[200px] whitespace-normal' : 'whitespace-nowrap',
                          c.align === 'right' && 'text-right tabular-nums',
                          c.className
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {!showSkeleton && !list.length && (empty ?? <EmptyState title="Nothing here yet" />)}
      </div>
      {pagination && <Pager {...pagination} />}
    </>
  );
}

function Pager({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationState) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
      <span aria-live="polite">
        {total ? `Showing ${start}–${Math.min(page * pageSize, total)} of ${total}` : 'No results'}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            Rows
            <NativeSelect
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="h-8 w-[72px]"
              aria-label="Rows per page"
            >
              {PAGE_SIZES.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span>
          Page {Math.min(page, pages)} of {pages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
