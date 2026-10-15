import { formatDate, RELEASE_SORTS, type ReleaseView } from '@dsol/shared';
import { Eye, FilePlus2, Mail, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { FilterBar, Segmented } from '@/components/common/FilterBar';
import { NativeSelect } from '@/components/common/NativeSelect';
import { RowMenu } from '@/components/common/RowMenu';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { useCan } from '@/lib/auth';
import { useListParams } from '@/lib/useListParams';
import { useReleaseActions, useReleases } from '../hooks/useReleases';
import { AddToBillingDialog } from './AddToBillingDialog';
import { ReleaseBillingBadge } from './ReleaseBillingBadge';
import { SendEmailDialog } from '@/features/email/components/SendEmailDialog';
import { ReleaseNotesDialog } from './ReleaseNotesDialog';
import { ReleaseTimeline } from './ReleaseTimeline';
import { ReleaseDrawer } from './ReleaseDrawer';

const FILTERS = ['client', 'view'] as const;

/**
 * Releases with filters, Table / Timeline toggle, billing state and every release action.
 * Used by the Releases page (all projects) and the project page's Releases tab (`projectId`).
 */
export function ReleasesBoard({
  projectId,
  clientId,
  header
}: {
  projectId?: string;
  clientId?: string;
  /** Page header, given a function that opens the "Add release" drawer. */
  header?: (openAdd: () => void) => ReactNode;
}) {
  const scoped = !!projectId;
  const params = useListParams({ sort: 'date:desc', filters: FILTERS, pageSize: 25 });
  const view = params.filters.view || (scoped ? 'timeline' : 'table');
  const q = {
    ...params.query,
    project: projectId,
    client: projectId ? undefined : params.filters.client || undefined,
    sort: RELEASE_SORTS.includes(params.sort.id as (typeof RELEASE_SORTS)[number])
      ? params.query.sort
      : undefined
  };
  const { data, isLoading, isFetching, error, refetch } = useReleases(q);
  const clients = useClientOptions();
  const canWrite = useCan('releases.write');
  const canBill = useCan('work.write');
  const { remove } = useReleaseActions();

  const [drawer, setDrawer] = useState<{ open: boolean; release: ReleaseView | null }>({
    open: false,
    release: null
  });
  const [billing, setBilling] = useState<ReleaseView | null>(null);
  const [notes, setNotes] = useState<ReleaseView | null>(null);
  const [mailing, setMailing] = useState<ReleaseView | null>(null);
  const canEmail = useCan('emails.send');
  const [deleting, setDeleting] = useState<ReleaseView | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const actions = (r: ReleaseView) => (
    <>
      <DropdownMenuItem onSelect={() => setNotes(r)}>
        <Eye /> Preview release notes
      </DropdownMenuItem>
      {canWrite && (
        <DropdownMenuItem onSelect={() => setDrawer({ open: true, release: r })}>
          <Pencil /> Edit release
        </DropdownMenuItem>
      )}
      {canEmail && (
        <DropdownMenuItem onSelect={() => setMailing(r)}>
          <Mail /> {r.mailStatus === 'Sent' ? 'Send release email again' : 'Send release email'}
        </DropdownMenuItem>
      )}
      {canBill && (
        <DropdownMenuItem onSelect={() => setBilling(r)}>
          <FilePlus2 /> Add to billing
        </DropdownMenuItem>
      )}
      {canWrite && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={r.billing.invoiced > 0}
            onSelect={() => setDeleting(r)}
          >
            <Trash2 /> Delete release
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  const columns: Column<ReleaseView>[] = [
    {
      id: 'project',
      header: 'Client · Project',
      sortable: true,
      cell: r => (
        <div>
          <div className="font-semibold">{r.projectName}</div>
          <div className="text-xs text-muted-foreground">{r.clientName}</div>
        </div>
      )
    },
    {
      id: 'version',
      header: 'Version',
      sortable: true,
      cell: r => <span className="font-mono font-semibold">{r.version}</span>
    },
    {
      id: 'date',
      header: 'Release date',
      sortable: true,
      cell: r => <span className="text-muted-foreground">{formatDate(r.releaseDate)}</span>
    },
    { id: 'features', header: 'Features', align: 'right', cell: r => r.features.length },
    { id: 'fixes', header: 'Bug fixes', align: 'right', cell: r => r.fixes.length },
    {
      id: 'issues',
      header: 'Known issues',
      align: 'right',
      cell: r => <span className={r.issues.length ? 'text-warn' : ''}>{r.issues.length}</span>
    },
    { id: 'by', header: 'Released by', cell: r => r.releasedByName ?? '—' },
    { id: 'mail', header: 'Email', cell: r => <StatusBadge status={r.mailStatus} dot={false} /> },
    {
      id: 'billing',
      header: 'Billing',
      cell: r => <ReleaseBillingBadge r={r} onAdd={canBill ? () => setBilling(r) : undefined} />
    },
    {
      id: 'menu',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: r => <RowMenu label={`Actions for ${r.version}`}>{actions(r)}</RowMenu>
    }
  ];

  const s = data?.summary;
  return (
    <>
      {header?.(() => setDrawer({ open: true, release: null }))}
      {!scoped && (
        <StatGrid>
          <StatCard
            label="Releases this month"
            value={s?.thisMonth ?? '—'}
            loading={isLoading}
            hint={new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          />
          <StatCard
            label="Released to production"
            value={s?.deployedProd ?? '—'}
            loading={isLoading}
            tone="ok"
            hint="all time"
          />
          <StatCard
            label="Emails pending"
            value={s?.mailPending ?? '—'}
            loading={isLoading}
            hint="release notifications"
          />
        </StatGrid>
      )}
      <Card>
        {scoped ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-[15px] font-semibold">Release history</h2>
            <div className="flex flex-wrap gap-2">
              <Segmented
                label="View"
                value={view as 'table'}
                onChange={v => params.setFilter('view', v)}
                options={[
                  ['timeline', 'Timeline'],
                  ['table', 'Table']
                ]}
              />
              {canWrite && (
                <Button size="sm" onClick={() => setDrawer({ open: true, release: null })}>
                  <Plus /> Add release
                </Button>
              )}
            </div>
          </div>
        ) : (
          <FilterBar
            active={
              (params.active && Object.entries(params.filters).some(([k, v]) => k !== 'view' && v)) ||
              !!params.q
            }
            onClear={params.clear}
          >
            <SearchInput
              value={params.q}
              onChange={params.setQ}
              placeholder="Search version, project or client"
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
            <div className="ml-auto">
              <Segmented
                label="View"
                value={view as 'table'}
                onChange={v => params.setFilter('view', v)}
                options={[
                  ['table', 'Table'],
                  ['timeline', 'Timeline']
                ]}
              />
            </div>
          </FilterBar>
        )}

        {view === 'timeline' ? (
          <div className="px-5 pb-5 pt-2">
            {error && !data ? (
              <ErrorState error={error} onRetry={refetch} />
            ) : !data ? (
              <div className="space-y-3">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
              </div>
            ) : data.items.length ? (
              <ReleaseTimeline
                releases={data.items}
                open={expanded}
                onToggle={id =>
                  setExpanded(s0 =>
                    s0.has(id) ? new Set([...s0].filter(x => x !== id)) : new Set([...s0, id])
                  )
                }
                actions={r => (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setNotes(r)}>
                      Preview release notes
                    </Button>
                    {canWrite && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDrawer({ open: true, release: r })}
                      >
                        Edit
                      </Button>
                    )}
                    {canBill && (
                      <Button size="sm" variant="outline" onClick={() => setBilling(r)}>
                        <FilePlus2 /> Add to billing
                      </Button>
                    )}
                    <ReleaseBillingBadge r={r} />
                  </>
                )}
              />
            ) : (
              <EmptyState
                icon={Rocket}
                title="No releases yet"
                description="Releases for this scope appear here."
              />
            )}
          </div>
        ) : (
          <DataTable
            label="Releases"
            columns={scoped ? columns.filter(c => c.id !== 'project') : columns}
            rows={data?.items}
            getRowId={r => r.id}
            loading={isLoading || isFetching}
            error={error}
            onRetry={refetch}
            sort={params.sort}
            onSortChange={params.setSort}
            pagination={
              data && {
                page: data.page,
                pageSize: data.pageSize,
                total: data.total,
                onPageChange: params.setPage,
                onPageSizeChange: params.setPageSize
              }
            }
            empty={
              <EmptyState
                icon={Rocket}
                title="No releases match"
                description="Change the filters, or add a release."
              />
            }
          />
        )}
      </Card>

      <ReleaseDrawer
        open={drawer.open}
        onOpenChange={o => setDrawer(d => ({ ...d, open: o }))}
        release={drawer.release}
        defaults={{ projectId, clientId }}
        onSaved={(r, bill) => bill && canBill && setBilling(r)}
      />
      <AddToBillingDialog release={billing} onOpenChange={o => !o && setBilling(null)} />
      <ReleaseNotesDialog release={notes} onOpenChange={o => !o && setNotes(null)} />
      <SendEmailDialog
        request={mailing && { for: 'release', release: mailing.id }}
        onOpenChange={o => !o && setMailing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        title={`Delete ${deleting?.version}?`}
        description="The release and its notes are removed. Work already logged from it stays in Billable work."
        confirmLabel="Delete release"
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => toast.success(`${deleting.version} deleted`),
            onSettled: () => setDeleting(null)
          })
        }
      />
    </>
  );
}
