import type {
  ReleaseBill,
  ReleaseCreate,
  ReleaseListQuery,
  ReleaseListResponse,
  ReleaseUpdate,
  ReleaseView
} from '@dsol/shared';
import { api, qs } from '@/lib/api';

type Q = Record<string, string | number | undefined>;

export const releasesApi = {
  list: (q: ReleaseListQuery) => api.get<ReleaseListResponse>('/releases' + qs(q as Q)),
  get: (id: string) => api.get<ReleaseView>(`/releases/${id}`),
  create: (body: ReleaseCreate) => api.post<ReleaseView>('/releases', body),
  update: (id: string, body: ReleaseUpdate) => api.patch<ReleaseView>(`/releases/${id}`, body),
  remove: (id: string) => api.delete(`/releases/${id}`),
  markDeployed: (id: string) => api.post<ReleaseView>(`/releases/${id}/mark-deployed`),
  bill: (id: string, body: ReleaseBill) =>
    api.post<{ added: number; skipped: number; release: ReleaseView }>(`/releases/${id}/bill`, body)
};
