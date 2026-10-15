/** A project's renewals: due items, history, renew, recurring costs, domain auto-renew. */
import type { ProjectCost, ProjectCostAdd, ProjectRenewals, RenewCreate, RenewResult } from '@dsol/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const enc = encodeURIComponent;

export const renewalsApi = {
  forProject: (projectId: string) => api.get<ProjectRenewals>(`/projects/${projectId}/renewals`),
  renew: (projectId: string, ref: string, body: RenewCreate) =>
    api.post<RenewResult>(`/renewals/${projectId}/${enc(ref)}/renew`, body),
  addCost: (projectId: string, body: ProjectCostAdd) =>
    api.post<ProjectCost>(`/projects/${projectId}/costs`, body),
  autoRenew: (projectId: string, on: boolean) =>
    api.patch<{ on: boolean }>(`/projects/${projectId}/auto-renew`, { on })
};

export const useProjectRenewals = (projectId: string) =>
  useQuery({ queryKey: ['renewals', projectId], queryFn: () => renewalsApi.forProject(projectId) });

/** Renewing changes the sheet, the project's costs, alerts and reports. */
export const useRenewalActions = (projectId: string) => {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all(
      [['renewals', projectId], ['projects'], ['alerts'], ['reports']].map(queryKey =>
        qc.invalidateQueries({ queryKey })
      )
    );
  return {
    renew: useMutation({
      mutationFn: ({ ref, body }: { ref: string; body: RenewCreate }) =>
        renewalsApi.renew(projectId, ref, body),
      onSuccess: refresh,
      meta: { silent: true }
    }),
    addCost: useMutation({
      mutationFn: (body: ProjectCostAdd) => renewalsApi.addCost(projectId, body),
      onSuccess: refresh,
      meta: { silent: true }
    }),
    autoRenew: useMutation({
      mutationFn: (on: boolean) => renewalsApi.autoRenew(projectId, on),
      onSuccess: refresh
    })
  };
};
