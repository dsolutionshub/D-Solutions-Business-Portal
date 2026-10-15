/** Alerts (bell + inbox), manual notices and reminder preferences. */
import type {
  AlertListQuery,
  AlertListResponse,
  NoticeCreate,
  NoticeView,
  NotificationPrefs,
  NotificationPrefsUpdate
} from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

const enc = encodeURIComponent;

export const alertsApi = {
  list: (q: AlertListQuery) => api.get<AlertListResponse>('/alerts' + qs(q as Record<string, string>)),
  set: (id: string, action: 'read' | 'unread' | 'dismiss') => api.post(`/alerts/${enc(id)}/${action}`),
  readAll: () => api.post<{ updated: number }>('/alerts/read-all'),
  restoreDismissed: () => api.post<{ restored: number }>('/alerts/restore-dismissed'),
  notices: () => api.get<{ items: NoticeView[] }>('/notices'),
  addNotice: (body: NoticeCreate) => api.post<NoticeView>('/notices', body),
  removeNotice: (id: string) => api.delete(`/notices/${id}`),
  prefs: () => api.get<NotificationPrefs>('/notification-prefs'),
  savePrefs: (body: NotificationPrefsUpdate) => api.patch<NotificationPrefs>('/notification-prefs', body)
};

/** Alerts refresh every few minutes, so the bell stays current while the app is open. */
export const useAlerts = (q: AlertListQuery = {}) =>
  useQuery({
    queryKey: ['alerts', q],
    queryFn: () => alertsApi.list(q),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000
  });

export const useAlertActions = () => {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['alerts'] });
  return {
    set: useMutation({
      mutationFn: ({ id, action }: { id: string; action: 'read' | 'unread' | 'dismiss' }) =>
        alertsApi.set(id, action),
      onSuccess: refresh
    }),
    readAll: useMutation({ mutationFn: alertsApi.readAll, onSuccess: refresh }),
    restore: useMutation({ mutationFn: alertsApi.restoreDismissed, onSuccess: refresh })
  };
};

export const useNotices = () =>
  useQuery({ queryKey: ['notices'], queryFn: alertsApi.notices, select: d => d.items });

export const useNoticeActions = () => {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['notices'] }),
      qc.invalidateQueries({ queryKey: ['alerts'] })
    ]);
  return {
    add: useMutation({ mutationFn: alertsApi.addNotice, onSuccess: refresh, meta: { silent: true } }),
    remove: useMutation({ mutationFn: alertsApi.removeNotice, onSuccess: refresh })
  };
};

export const usePrefs = () => useQuery({ queryKey: ['notification-prefs'], queryFn: alertsApi.prefs });

export const useSavePrefs = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: alertsApi.savePrefs,
    onSuccess: data => {
      qc.setQueryData(['notification-prefs'], data);
      return Promise.all([
        qc.invalidateQueries({ queryKey: ['alerts'] }),
        qc.invalidateQueries({ queryKey: ['settings'] })
      ]);
    }
  });
};
