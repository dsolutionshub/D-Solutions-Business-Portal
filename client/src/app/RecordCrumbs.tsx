import { useClient } from '@/features/clients/hooks/useClients';
import { useProject } from '@/features/projects/hooks/useProjects';

/** Breadcrumb labels for detail routes: the record's name (shares the page's cached query). */
export function ClientCrumb({ id }: { id: string }) {
  const { data } = useClient(id);
  return <>{data?.name ?? '…'}</>;
}

export function ProjectCrumb({ id }: { id: string }) {
  const { data } = useProject(id);
  return <>{data?.project.name ?? '…'}</>;
}
