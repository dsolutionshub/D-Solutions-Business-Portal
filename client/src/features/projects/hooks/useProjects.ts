import type { ProjectListQuery, ProjectSaveInput } from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api';

export const projectKeys = {
  all: ['projects'] as const,
  list: (q: ProjectListQuery) => ['projects', 'list', q] as const,
  detail: (id: string) => ['projects', 'detail', id] as const
};

export const useProjectsList = (q: ProjectListQuery, enabled = true) =>
  useQuery({
    queryKey: projectKeys.list(q),
    queryFn: () => projectsApi.list(q),
    placeholderData: keepPreviousData,
    enabled
  });

export const useProject = (id: string | undefined) =>
  useQuery({ queryKey: projectKeys.detail(id ?? ''), queryFn: () => projectsApi.get(id!), enabled: !!id });

/** Project changes also change client pages (project counts, next domain expiry). */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: projectKeys.all }),
      qc.invalidateQueries({ queryKey: ['clients'] })
    ]);
}

export const useCreateProject = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ProjectSaveInput) => projectsApi.create(body),
    onSuccess: invalidate,
    meta: { silent: true }
  });
};

export const useUpdateProject = (id: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ProjectSaveInput) => projectsApi.update(id, body),
    onSuccess: invalidate,
    meta: { silent: true }
  });
};

/** A reveal function for SecretField. Values are never cached by React Query. */
export const revealer = (projectId: string) => (field: string) => () => projectsApi.reveal(projectId, field);
