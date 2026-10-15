import type { ClientView, ProjectListItem } from '@dsol/shared';
import { Briefcase, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { EnvBadge } from '@/components/common/EnvBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { useProjectsList } from '@/features/projects/hooks/useProjects';

/**
 * Just a list to open each project. URLs, domain, hosting, database, keys, releases and
 * delivered work live on the project page — never repeated here.
 */
export function ProjectsTab({ client }: { client: ClientView }) {
  const { data, isLoading, error, refetch } = useProjectsList({
    client: client.id,
    pageSize: 100,
    sort: 'name:asc'
  });
  const canAdd = useCan('projects.write') && !client.archivedAt;

  const columns: Column<ProjectListItem>[] = [
    {
      id: 'name',
      header: 'Project',
      cell: p => (
        <div>
          <Link
            to={`/projects/${p.id}`}
            className="font-semibold hover:text-primary-soft-foreground hover:underline"
          >
            {p.name}
          </Link>
        </div>
      )
    },
    { id: 'type', header: 'Type', cell: p => p.type ?? '—' },
    {
      id: 'envs',
      header: 'Environments',
      cell: p => (
        <span className="flex gap-1">
          {p.environments.map(e => (
            <EnvBadge key={e} env={e} />
          ))}
        </span>
      )
    },
    { id: 'status', header: 'Status', cell: p => <StatusBadge status={p.status} /> },
    {
      id: 'open',
      header: <span className="sr-only">Open</span>,
      align: 'right',
      cell: p => (
        <Button asChild size="sm" variant="outline">
          <Link to={`/projects/${p.id}`}>Open</Link>
        </Button>
      )
    }
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">Projects</h2>
          <p className="text-xs text-muted-foreground">
            Open a project for its URLs, domain, hosting, database, keys, releases and delivered work.
          </p>
        </div>
        {canAdd && (
          <Button asChild size="sm">
            <Link to={`/projects/new?client=${client.id}`}>
              <Plus /> New project
            </Link>
          </Button>
        )}
      </div>
      <DataTable
        label={`Projects of ${client.name}`}
        columns={columns}
        rows={data?.items}
        getRowId={p => p.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        empty={
          <EmptyState
            icon={Briefcase}
            title="No projects yet"
            description="Create the first project for this client."
          />
        }
      />
    </>
  );
}
