import { formatInr, PROJECT_SORTS, PROJECT_STATUSES, type ProjectListItem } from '@dsol/shared';
import { Briefcase, Eye, Pencil, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { ClientLogo } from '@/components/common/ClientLogo';
import { DataTable, type Column } from '@/components/common/DataTable';
import { DateWithDaysLeft } from '@/components/common/DateWithDaysLeft';
import { EmptyState } from '@/components/common/EmptyState';
import { EnvBadge } from '@/components/common/EnvBadge';
import { FilterBar, Segmented } from '@/components/common/FilterBar';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { RowMenu } from '@/components/common/RowMenu';
import { SearchInput } from '@/components/common/SearchInput';
import { StatusBadge } from '@/components/common/StatusBadge';
import { UrlLink } from '@/components/common/UrlLink';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { useCan } from '@/lib/auth';
import { useListParams } from '@/lib/useListParams';
import { listOptions, useLists } from '@/lib/useLists';
import { useProjectsList } from '../hooks/useProjects';

const FILTERS = ['client', 'status', 'type'] as const;
const STATUS_OPTIONS = [['', 'All'] as const, ...PROJECT_STATUSES.map(s => [s, s] as const)];

export function ProjectsListPage() {
  const params = useListParams({ sort: 'name:asc', filters: FILTERS });
  const { data, isLoading, isFetching, error, refetch } = useProjectsList({
    ...params.query,
    client: params.filters.client || undefined,
    type: params.filters.type || undefined,
    status: (params.filters.status || 'all') as 'all',
    sort: PROJECT_SORTS.includes(params.sort.id as (typeof PROJECT_SORTS)[number])
      ? params.query.sort
      : undefined
  });
  const clients = useClientOptions();
  const lists = useLists();
  const canWrite = useCan('projects.write');
  const canSheet = useCan('projects.sheet');

  const columns: Column<ProjectListItem>[] = [
    {
      id: 'name',
      header: 'Project',
      sortable: true,
      cell: p => (
        <div>
          <Link
            to={`/projects/${p.id}`}
            className="font-semibold hover:text-primary-soft-foreground hover:underline"
          >
            {p.name}
          </Link>
          <div className="mt-1 flex gap-1">
            {p.environments.map(e => (
              <EnvBadge key={e} env={e} />
            ))}
          </div>
        </div>
      )
    },
    {
      id: 'client',
      header: 'Client',
      sortable: true,
      cell: p => (
        <Link to={`/clients/${p.clientId}`} className="flex items-center gap-2 hover:underline">
          <ClientLogo name={p.clientName} color={p.clientColor} logoUrl={p.clientLogoUrl} size={26} />
          {p.clientName}
        </Link>
      )
    },
    // Accounts see hosting cost and domain expiry, but no URLs or database details.
    ...(canSheet
      ? ([
          { id: 'prod', header: 'Production URL', cell: p => <UrlLink href={p.prodUrl} /> }
        ] satisfies Column<ProjectListItem>[])
      : []),
    ...([
      {
        id: 'hosting',
        header: 'Hosting',
        cell: p => (
          <div>
            <div>{p.hostingPlatform ?? '—'}</div>
            {p.hostingCostPaise != null && (
              <div className="text-xs text-muted-foreground">
                {formatInr(p.hostingCostPaise)} / {p.hostingCycle === 'Yearly' ? 'year' : 'month'}
              </div>
            )}
          </div>
        )
      },
      {
        id: 'domainExpiry',
        header: 'Domain expiry',
        sortable: true,
        cell: p => (
          <div title={p.domainName ?? undefined}>
            <DateWithDaysLeft iso={p.domainExpiry} />
          </div>
        )
      }
    ] satisfies Column<ProjectListItem>[]),
    ...(canSheet
      ? ([{ id: 'db', header: 'Database', cell: p => p.dbEngine ?? '—' }] satisfies Column<ProjectListItem>[])
      : []),
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      cell: p => <StatusBadge status={p.status} />
    },
    {
      id: 'menu',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: p => (
        <RowMenu label={`Actions for ${p.name}`}>
          <DropdownMenuItem asChild>
            <Link to={`/projects/${p.id}`}>
              <Eye /> Open project
            </Link>
          </DropdownMenuItem>
          {canWrite && (
            <DropdownMenuItem asChild>
              <Link to={`/projects/${p.id}/edit`}>
                <Pencil /> Edit project
              </Link>
            </DropdownMenuItem>
          )}
        </RowMenu>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          canWrite && (
            <Button asChild>
              <Link to="/projects/new">
                <Plus /> New project
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <FilterBar active={params.active} onClear={params.clear}>
          <SearchInput
            value={params.q}
            onChange={params.setQ}
            placeholder="Search project, client, domain or stack"
          />
          <NativeSelect
            value={params.filters.client}
            onChange={e => params.setFilter('client', e.target.value)}
            aria-label="Client"
            className="w-[200px]"
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
            aria-label="Project type"
            className="w-[200px]"
          >
            <option value="">All types</option>
            {listOptions(lists.data, 'projectType', params.filters.type).map(t => (
              <option key={t}>{t}</option>
            ))}
          </NativeSelect>
          <Segmented
            label="Status"
            value={params.filters.status}
            onChange={v => params.setFilter('status', v)}
            options={STATUS_OPTIONS}
          />
        </FilterBar>
        <DataTable
          label="Projects"
          columns={columns}
          rows={data?.items}
          getRowId={p => p.id}
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
                title="No projects found"
                description="Adjust the filters or add a new project."
                action={
                  <Button size="sm" variant="outline" onClick={params.clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Briefcase}
                title="No projects yet"
                description="Add a project to keep its URLs, domain, hosting, database and keys in one place."
              />
            )
          }
        />
      </Card>
    </>
  );
}
