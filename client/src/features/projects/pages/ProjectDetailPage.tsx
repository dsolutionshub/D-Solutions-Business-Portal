import { Download, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { BackButton } from '@/components/common/BackButton';
import { ClientLogo } from '@/components/common/ClientLogo';
import { ErrorState } from '@/components/common/ErrorState';
import { PageTabs } from '@/components/common/PageTabs';
import { StatusBadge } from '@/components/common/StatusBadge';
import { UrlLink } from '@/components/common/UrlLink';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth';
import { projectsApi } from '../api';
import { DetailsTab } from '../components/DetailsTab';
import { ReleasesTab } from '../components/ReleasesTab';
import { WorkBillingTab } from '../components/WorkBillingTab';
import { useProject } from '../hooks/useProjects';

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const { data: v, isLoading, error, refetch } = useProject(projectId);
  const canWrite = useCan('projects.write');
  const canSheet = useCan('projects.sheet');
  const [downloading, setDownloading] = useState(false);

  const back = (
    <div>
      <BackButton to="/projects" label="Back to projects" />
    </div>
  );

  if (isLoading)
    return (
      <>
        {back}
        <Card className="flex gap-4 p-5" aria-busy>
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </Card>
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </Card>
      </>
    );
  if (error || !v)
    return (
      <>
        {back}
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      </>
    );

  const p = v.project;
  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 items-center">
            <BackButton to="/projects" label="Back to projects" />
          </div>
          <ClientLogo name={v.client.name} color={v.client.color} logoUrl={v.client.logoUrl} size={48} />
          <div className="min-w-0 flex-[1_1_320px]">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight">{p.name}</h1>
              <StatusBadge status={p.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle-foreground">
              <Link to={`/clients/${v.client.id}`} className="text-primary-soft-foreground hover:underline">
                {v.client.name}
              </Link>
              {p.type && <span>{p.type}</span>}
              {v.sheet.links.prod && <UrlLink href={v.sheet.links.prod} />}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canSheet && (
              <Button
                variant="outline"
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  await projectsApi
                    .downloadSheet(p.id)
                    .then(() => toast.success('Project sheet downloaded (secrets hidden)'))
                    .catch(err => toast.error(err.message));
                  setDownloading(false);
                }}
              >
                <Download /> Download sheet
              </Button>
            )}
            {canWrite && (
              <Button asChild variant="outline">
                <Link to={`/projects/${p.id}/edit`}>
                  <Pencil /> Edit project
                </Link>
              </Button>
            )}
          </div>
        </div>
      </Card>

      <PageTabs
        defaultTab="details"
        tabs={[
          { value: 'details', label: 'Details', content: <DetailsTab view={v} /> },
          {
            value: 'releases',
            label: 'Releases',
            content: <ReleasesTab projectId={p.id} clientId={p.clientId} />
          },
          {
            value: 'billing',
            label: 'Work & billing',
            content: <WorkBillingTab projectId={p.id} clientId={p.clientId} />
          }
        ]}
      />
    </>
  );
}
