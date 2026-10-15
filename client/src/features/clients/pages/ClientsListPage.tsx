import { CLIENT_SORTS, type ClientListItem } from '@dsol/shared';
import { ArchiveRestore, Download, Eye, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ClientLogo } from '@/components/common/ClientLogo';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column } from '@/components/common/DataTable';
import { DateWithDaysLeft } from '@/components/common/DateWithDaysLeft';
import { EmptyState } from '@/components/common/EmptyState';
import { FilterBar, Segmented } from '@/components/common/FilterBar';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { RowMenu } from '@/components/common/RowMenu';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useCan } from '@/lib/auth';
import { useListParams } from '@/lib/useListParams';
import { clientsApi } from '../api';
import { useArchiveClient, useClientsList, useDeleteClient, useRestoreClient } from '../hooks/useClients';

const FILTERS = ['status', 'industry'] as const;
const STATUS_OPTIONS = [
  ['', 'All'],
  ['Active', 'Active'],
  ['Inactive', 'Inactive'],
  ['Archived', 'Archived']
] as const;

export function ClientsListPage() {
  const params = useListParams({ sort: 'name:asc', filters: FILTERS });
  const { data, isLoading, isFetching, error, refetch } = useClientsList({
    ...params.query,
    status: (params.filters.status || 'all') as 'all',
    sort: CLIENT_SORTS.includes(params.sort.id as (typeof CLIENT_SORTS)[number])
      ? params.query.sort
      : undefined
  });
  const canWrite = useCan('clients.write');
  const canArchive = useCan('clients.archive');
  const archive = useArchiveClient();
  const restore = useRestoreClient();
  const remove = useDeleteClient();
  const [confirm, setConfirm] = useState<ClientListItem | null>(null);
  const [deleting, setDeleting] = useState<ClientListItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const columns: Column<ClientListItem>[] = [
    {
      id: 'name',
      header: 'Client',
      sortable: true,
      cell: c => (
        <div className="flex items-center gap-2.5">
          <ClientLogo name={c.name} color={c.color} logoUrl={c.logoUrl} size={36} wide={2} />
          <div className="min-w-0">
            <Link
              to={`/clients/${c.id}`}
              className="font-semibold hover:text-primary-soft-foreground hover:underline"
            >
              {c.name}
            </Link>
            <div className="text-xs">
              {c.website && (
                <a
                  href={c.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-soft-foreground hover:underline"
                >
                  {c.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>
        </div>
      )
    },
    { id: 'contact', header: 'Primary contact', cell: c => c.contactName ?? '—' },
    {
      id: 'email',
      header: 'Email',
      cell: c =>
        c.contactEmail ? (
          <a href={`mailto:${c.contactEmail}`} className="text-primary-soft-foreground hover:underline">
            {c.contactEmail}
          </a>
        ) : (
          '—'
        )
    },
    { id: 'phone', header: 'Phone', cell: c => c.contactPhone ?? '—' },
    {
      id: 'domainExpiry',
      header: 'Domain expiry',
      sortable: true,
      cell: c => (
        <div title={c.nextDomainName ?? undefined}>
          <DateWithDaysLeft iso={c.nextDomainExpiry} />
        </div>
      )
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      cell: c => (c.archivedAt ? <StatusBadge status="Archived" /> : <StatusBadge status={c.status} />)
    },
    {
      id: 'menu',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: c => (
        <RowMenu label={`Actions for ${c.name}`}>
          <DropdownMenuItem asChild>
            <Link to={`/clients/${c.id}`}>
              <Eye /> View details
            </Link>
          </DropdownMenuItem>
          {canWrite && !c.archivedAt && (
            <DropdownMenuItem asChild>
              <Link to={`/clients/${c.id}/edit`}>
                <Pencil /> Edit client
              </Link>
            </DropdownMenuItem>
          )}
          {canArchive && (
            <>
              <DropdownMenuSeparator />
              {c.archivedAt ? (
                <>
                  <DropdownMenuItem onSelect={() => restore.mutate(c.id)}>
                    <ArchiveRestore /> Restore client
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => setDeleting(c)}
                  >
                    <Trash2 /> Delete permanently
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirm(c)}
                >
                  <Trash2 /> Archive client
                </DropdownMenuItem>
              )}
            </>
          )}
        </RowMenu>
      )
    }
  ];

  const s = data?.summary;
  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <>
            <Button
              variant="outline"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                await clientsApi.exportCsv().catch(() => undefined);
                setExporting(false);
              }}
            >
              <Download /> Export CSV
            </Button>
            {canWrite && (
              <Button asChild>
                <Link to="/clients/new">
                  <Plus /> Add client
                </Link>
              </Button>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard label="Clients" value={s?.total ?? '—'} loading={isLoading} hint="not archived" />
        <StatCard label="Active" value={s?.active ?? '—'} loading={isLoading} tone="ok" />
        <StatCard
          label="Inactive"
          value={s?.inactive ?? '—'}
          loading={isLoading}
          hint="hidden from pickers"
        />
        <StatCard label="Archived" value={s?.archived ?? '—'} loading={isLoading} hint="kept for records" />
      </StatGrid>

      <Card>
        <FilterBar active={params.active} onClear={params.clear}>
          <SearchInput value={params.q} onChange={params.setQ} placeholder="Search name, contact or email" />
          <Segmented
            label="Status"
            value={params.filters.status as (typeof STATUS_OPTIONS)[number][0]}
            onChange={v => params.setFilter('status', v)}
            options={STATUS_OPTIONS}
          />
          <NativeSelect
            value={params.filters.industry}
            onChange={e => params.setFilter('industry', e.target.value)}
            aria-label="Industry"
            className="w-[200px]"
          >
            <option value="">All industries</option>
            {[...new Set([...(data?.industries ?? []), params.filters.industry].filter(Boolean))].map(i => (
              <option key={i}>{i}</option>
            ))}
          </NativeSelect>
        </FilterBar>
        <DataTable
          label="Clients"
          columns={columns}
          rows={data?.items}
          getRowId={c => c.id}
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
            params.active ? (
              <EmptyState
                title="No clients match these filters"
                description="Try a different search or clear the filters."
                action={
                  <Button size="sm" variant="outline" onClick={params.clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No clients yet"
                description="Add your first client to start tracking their projects."
                action={
                  canWrite && (
                    <Button size="sm" asChild>
                      <Link to="/clients/new">Add client</Link>
                    </Button>
                  )
                }
              />
            )
          }
        />
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={o => !o && setConfirm(null)}
        title={`Archive ${confirm?.name}?`}
        description="The client is hidden from lists and pickers, and reminders stop. Projects, invoices and history are kept, and you can restore it any time. Clients with unpaid invoices can't be archived."
        confirmLabel="Archive client"
        pending={archive.isPending}
        onConfirm={() => confirm && archive.mutate(confirm.id, { onSettled: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        title={`Delete ${deleting?.name} permanently?`}
        description="The client and everything that belongs to it — projects (with their keys and passwords), releases, delivered work, renewal history, emails and contacts — are deleted for good. Clients with invoices can't be deleted: invoices are financial records and are kept. This can't be undone."
        confirmLabel="Delete permanently"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSettled: () => setDeleting(null) })}
      />
    </>
  );
}
