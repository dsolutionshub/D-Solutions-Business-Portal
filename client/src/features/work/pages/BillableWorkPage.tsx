import { formatInr, WORK_TYPES, type WorkFilter, type WorkView } from '@dsol/shared';
import { AlertTriangle, FilePlus2, FileText, Info, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FilterBar } from '@/components/common/FilterBar';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { useCan } from '@/lib/auth';
import { useListParams } from '@/lib/useListParams';
import { cn } from '@/lib/utils';
import { WorkItemDialog } from '../components/WorkItemDialog';
import { WorkTable } from '../components/WorkTable';
import { useWork } from '../hooks/useWork';

const FILTERS = ['client', 'type', 'status', 'release', 'project'] as const;
const CHIPS: [WorkFilter, string][] = [
  ['open', 'Not invoiced'],
  ['Needs price', 'Needs price'],
  ['To bill', 'To bill'],
  ['billed', 'Invoiced, awaiting payment'],
  ['Paid', 'Paid'],
  ['Not billable', 'Not billable'],
  ['all', 'All']
];

export function BillableWorkPage() {
  const navigate = useNavigate();
  const params = useListParams({ sort: 'delivered:desc', filters: FILTERS, pageSize: 50 });
  const status = (params.filters.status || 'open') as WorkFilter;
  const { data, isLoading, isFetching, error, refetch } = useWork({
    q: params.query.q,
    page: params.page,
    pageSize: params.pageSize,
    status,
    client: params.filters.client || undefined,
    type: (params.filters.type || undefined) as WorkView['type'] | undefined,
    release: params.filters.release || undefined,
    project: params.filters.project || undefined
  });
  const clients = useClientOptions();
  const canWrite = useCan('work.write');
  const canInvoice = useCan('invoices.write');
  const [dialog, setDialog] = useState<{ open: boolean; work: WorkView | null }>({ open: false, work: null });
  const [picked, setPicked] = useState<Map<string, WorkView>>(new Map());

  // Keep the selection to "To bill" rows still on screen after filters or saves change the list.
  const items = data?.items;
  useEffect(() => {
    if (!items) return;
    setPicked(p => new Map([...p].filter(([id]) => items.some(w => w.id === id && w.status === 'To bill'))));
  }, [items]);

  const pickedList = [...picked.values()];
  const pickedClients = new Set(pickedList.map(w => w.clientId));
  const pickedTotal = pickedList.reduce((a, w) => a + w.billablePaise, 0);
  const selection = useMemo(
    () => ({
      selected: new Set(picked.keys()),
      toggle: (w: WorkView, checked: boolean) =>
        setPicked(p => {
          const next = new Map(p);
          if (checked) next.set(w.id, w);
          else next.delete(w.id);
          return next;
        })
    }),
    [picked]
  );
  const s = data?.summary;

  return (
    <>
      <PageHeader
        title="Billable work"
        actions={
          <>
            {canInvoice && (
              <Button asChild variant="outline">
                <Link to="/invoices">
                  <FileText /> Invoices
                </Link>
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => setDialog({ open: true, work: null })}>
                <Plus /> Log delivered work
              </Button>
            )}
          </>
        }
      />
      <StatGrid>
        <StatCard
          label="Ready to invoice"
          value={s ? formatInr(s.toBill.amountPaise) : '—'}
          tone="primary"
          loading={isLoading}
          hint={s && `${s.toBill.count} item(s) · ${s.toBill.clients} client(s)`}
        />
        <StatCard
          label="Needs a price"
          value={s?.needsPrice.count ?? '—'}
          tone={s?.needsPrice.count ? 'warn' : 'default'}
          loading={isLoading}
          hint="delivered but not priced yet"
        />
        <StatCard
          label="Invoiced, awaiting payment"
          value={s ? formatInr(s.billed.amountPaise) : '—'}
          loading={isLoading}
          hint={s && `${s.billed.overdueCount} item(s) on overdue invoices`}
        />
        <StatCard
          label="Paid"
          value={s ? formatInr(s.paid.amountPaise) : '—'}
          tone="ok"
          loading={isLoading}
          hint={s && `${s.paid.count} item(s)`}
        />
      </StatGrid>

      <Card>
        <FilterBar active={params.active} onClear={params.clear}>
          <SearchInput
            value={params.q}
            onChange={params.setQ}
            placeholder="Search work, project, client or release"
          />
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
          <NativeSelect
            value={params.filters.type}
            onChange={e => params.setFilter('type', e.target.value)}
            aria-label="Type"
            className="w-[160px]"
          >
            <option value="">All types</option>
            {WORK_TYPES.map(t => (
              <option key={t}>{t}</option>
            ))}
          </NativeSelect>
          {(params.filters.release || params.filters.project) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => (params.setFilter('release', ''), params.setFilter('project', ''))}
            >
              Showing one {params.filters.release ? 'release' : 'project'} · show all
            </Button>
          )}
        </FilterBar>
        <div className="flex flex-wrap gap-2 border-b px-4 py-3" role="radiogroup" aria-label="Status">
          {CHIPS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={status === v}
              onClick={() => params.setFilter('status', v === 'open' ? '' : v)}
              className={cn(
                'inline-flex h-[30px] items-center rounded-full border px-3 text-xs font-medium text-subtle-foreground',
                status === v && 'border-primary bg-primary-soft text-primary-soft-foreground'
              )}
            >
              {label} · {data?.counts[v] ?? '…'}
            </button>
          ))}
        </div>
        {pickedList.length ? (
          <div
            role="status"
            className={cn(
              'mx-4 my-3 flex flex-wrap items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm',
              pickedClients.size > 1 ? 'bg-warn-bg text-warn' : 'bg-info-bg text-info'
            )}
          >
            {pickedClients.size > 1 ? <AlertTriangle className="size-4" /> : <Info className="size-4" />}
            <span className="flex-1">
              {pickedList.length} selected · <b>{formatInr(pickedTotal)}</b>
              {pickedClients.size > 1
                ? ' — pick work for one client at a time to create an invoice.'
                : ` for ${pickedList[0]!.clientName}`}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Map())}>
              Clear
            </Button>
            {canInvoice && (
              <Button
                size="sm"
                disabled={pickedClients.size > 1}
                onClick={() => navigate(`/invoices/new?work=${pickedList.map(w => w.id).join(',')}`)}
              >
                <FilePlus2 /> Create invoice
              </Button>
            )}
          </div>
        ) : (
          canInvoice &&
          !!data?.counts['To bill'] && (
            <p className="px-5 py-2.5 text-xs text-muted-foreground">
              Tick the “To bill” items of one client, then create the invoice.
            </p>
          )
        )}
        <WorkTable
          rows={data?.items}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          showClient
          selection={canInvoice ? selection : undefined}
          onEdit={w => setDialog({ open: true, work: w })}
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
        {data && (
          <div className="flex justify-end border-t px-4 py-2.5 text-xs text-muted-foreground">
            Total in view: <b className="ml-1 text-foreground">{formatInr(data.viewTotalPaise)}</b>
          </div>
        )}
      </Card>
      <WorkItemDialog
        open={dialog.open}
        onOpenChange={o => setDialog(d => ({ ...d, open: o }))}
        work={dialog.work}
      />
    </>
  );
}
