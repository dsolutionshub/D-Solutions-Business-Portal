import type { WorkItemCreate, WorkItemUpdate, WorkListQuery, WorkListResponse, WorkView } from '@dsol/shared';
import { api, qs } from '@/lib/api';

type Q = Record<string, string | number | undefined>;

export const workApi = {
  list: (q: WorkListQuery) => api.get<WorkListResponse>('/work' + qs(q as Q)),
  create: (body: WorkItemCreate) => api.post<WorkView>('/work', body),
  update: (id: string, body: WorkItemUpdate) => api.patch<WorkView>(`/work/${id}`, body),
  remove: (id: string) => api.delete(`/work/${id}`),
  toggleBillable: (id: string) => api.post<WorkView>(`/work/${id}/toggle-billable`)
};
