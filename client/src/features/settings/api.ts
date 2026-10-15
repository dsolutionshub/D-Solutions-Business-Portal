/** Settings, dropdown lists, team and admin (export, daily reminders). */
import type {
  CronRun,
  ListKey,
  ListUsage,
  SettingsUpdate,
  TeamMember,
  UserCreate,
  UserUpdate
} from '@dsol/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SettingsView } from '@/lib/lookups';

const enc = encodeURIComponent;

export const settingsApi = {
  update: (body: SettingsUpdate) => api.patch<SettingsView>('/settings', body),
  addValue: (key: ListKey, value: string) => api.post<{ values: string[] }>(`/lists/${key}`, { value }),
  removeValue: (key: ListKey, value: string) =>
    api.delete<{ values: string[] }>(`/lists/${key}/${enc(value)}`),
  reorder: (key: ListKey, values: string[]) =>
    api.post<{ values: string[] }>(`/lists/${key}/reorder`, { values }),
  usage: (key: ListKey, value: string) => api.get<ListUsage>(`/lists/${key}/${enc(value)}/usage`),
  team: () => api.get<{ items: TeamMember[] }>('/users?view=team'),
  invite: (body: UserCreate) => api.post<TeamMember>('/users', body),
  updateUser: (id: string, body: UserUpdate) => api.patch<TeamMember>(`/users/${id}`, body),
  exportAll: () => api.download('/admin/export', 'dsol-portal-export.json'),
  cronRuns: () => api.get<{ items: CronRun[] }>('/admin/cron-runs'),
  runCron: () => api.post<CronRun>('/admin/run-cron')
};

export const useSaveSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: settingsApi.update,
    onSuccess: data => qc.setQueryData(['settings'], data),
    meta: { silent: true }
  });
};

/** Add / remove / reorder a dropdown list; every form sees the change at once. */
export const useListActions = () => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['lists'] });
  return {
    add: useMutation({
      mutationFn: ({ key, value }: { key: ListKey; value: string }) => settingsApi.addValue(key, value),
      onSuccess: refresh,
      meta: { silent: true }
    }),
    remove: useMutation({
      mutationFn: ({ key, value }: { key: ListKey; value: string }) => settingsApi.removeValue(key, value),
      onSuccess: refresh
    }),
    reorder: useMutation({
      mutationFn: ({ key, values }: { key: ListKey; values: string[] }) => settingsApi.reorder(key, values),
      onSuccess: refresh
    })
  };
};

export const useTeamMembers = () =>
  useQuery({ queryKey: ['users', 'team'], queryFn: settingsApi.team, select: d => d.items });

export const useTeamActions = () => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  return {
    invite: useMutation({ mutationFn: settingsApi.invite, onSuccess: refresh, meta: { silent: true } }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UserUpdate }) => settingsApi.updateUser(id, body),
      onSuccess: refresh
    })
  };
};

export const useCronRuns = (enabled = true) =>
  useQuery({ queryKey: ['cron-runs'], queryFn: settingsApi.cronRuns, select: d => d.items, enabled });
