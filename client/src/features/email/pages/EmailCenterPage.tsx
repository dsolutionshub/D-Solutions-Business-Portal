import { EMAIL_STATUSES, type EmailStatus } from '@dsol/shared';
import { FilterBar } from '@/components/common/FilterBar';
import { NativeSelect } from '@/components/common/NativeSelect';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { useListParams } from '@/lib/useListParams';
import { cn } from '@/lib/utils';
import { useEmailQuota, useEmails } from '../api';
import { EmailLayout } from '../components/EmailLayout';
import { EmailTable } from '../components/EmailTable';

const FILTERS = ['client', 'status'] as const;
const CHIPS: ('' | EmailStatus)[] = ['', ...EMAIL_STATUSES];

/** Email Center → Email history. */
export function EmailCenterPage() {
  const params = useListParams({ sort: 'date:desc', filters: FILTERS });
  const status = params.filters.status as EmailStatus | '';
  const { data, isLoading, isFetching, error, refetch } = useEmails({
    q: params.query.q,
    page: params.page,
    pageSize: params.pageSize,
    client: params.filters.client || undefined,
    status: status || undefined
  });
  const clients = useClientOptions();
  const quota = useEmailQuota().data;
  const s = data?.stats;

  return (
    <EmailLayout
      stats={
        <StatGrid>
          <StatCard
            label="Sent / delivered"
            value={s?.sent ?? '—'}
            tone="ok"
            loading={isLoading}
            hint={s?.logged ? `${s.logged} logged in dev mode` : undefined}
          />
          <StatCard label="Scheduled" value={s?.scheduled ?? '—'} loading={isLoading} />
          <StatCard
            label="Failed"
            value={s?.failed ?? '—'}
            tone={s?.failed ? 'bad' : 'default'}
            loading={isLoading}
            hint={s?.failed ? 'Retry from the list' : undefined}
          />
          <StatCard
            label="Sent today"
            value={quota ? `${quota.used} / ${quota.limit}` : '—'}
            tone={quota?.blocked ? 'bad' : quota?.warning ? 'warn' : 'default'}
            hint={
              quota?.blocked
                ? 'Daily limit reached — sending resumes tomorrow'
                : 'recipients, against the daily limit'
            }
          />
        </StatGrid>
      }
    >
      <FilterBar active={params.active} onClear={params.clear}>
        <SearchInput value={params.q} onChange={params.setQ} placeholder="Search subject or recipient" />
        <NativeSelect
          value={params.filters.client}
          onChange={e => params.setFilter('client', e.target.value)}
          aria-label="Client"
          className="w-[190px]"
        >
          <option value="">All clients</option>
          {(clients.data ?? []).map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </FilterBar>
      <div className="flex flex-wrap gap-2 border-b px-4 py-3" role="radiogroup" aria-label="Status">
        {CHIPS.map(v => (
          <button
            key={v || 'all'}
            type="button"
            role="radio"
            aria-checked={status === v}
            onClick={() => params.setFilter('status', v)}
            className={cn(
              'inline-flex h-[30px] items-center rounded-full border px-3 text-xs font-medium text-subtle-foreground',
              status === v && 'border-primary bg-primary-soft text-primary-soft-foreground'
            )}
          >
            {v || 'All'}
          </button>
        ))}
      </div>
      <EmailTable
        rows={data?.items}
        loading={isLoading || isFetching}
        error={error}
        onRetry={refetch}
        pagination={
          data && {
            page: data.page,
            pageSize: data.pageSize,
            total: data.total,
            onPageChange: params.setPage,
            onPageSizeChange: params.setPageSize
          }
        }
      />
    </EmailLayout>
  );
}
