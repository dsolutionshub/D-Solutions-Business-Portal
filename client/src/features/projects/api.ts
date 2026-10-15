import type {
  ProjectListQuery,
  ProjectListResponse,
  ProjectSaveInput,
  ProjectView,
  SecretReveal
} from '@dsol/shared';
import { api, qs } from '@/lib/api';

export const projectsApi = {
  list: (q: ProjectListQuery) =>
    api.get<ProjectListResponse>('/projects' + qs(q as Record<string, string | number | undefined>)),
  get: (id: string) => api.get<ProjectView>(`/projects/${id}`),
  create: (body: ProjectSaveInput) => api.post<ProjectView>('/projects', body),
  update: (id: string, body: ProjectSaveInput) => api.patch<ProjectView>(`/projects/${id}`, body),
  /** field: "db.password" or "extra:<id>". Audit-logged on the server. */
  reveal: (id: string, field: string) =>
    api.post<SecretReveal>(`/projects/${id}/secrets/reveal`, { field }).then(r => r.value),
  downloadSheet: (id: string) => api.download(`/projects/${id}/sheet.txt`, 'project-sheet.txt')
};
