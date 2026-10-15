/** Email Center: history, quota, prefilled emails, sending, templates. */
import type {
  EmailListQuery,
  EmailListResponse,
  EmailPrefill,
  EmailPrefillQuery,
  EmailQuota,
  EmailSend,
  EmailSendResult,
  EmailTemplateCreate,
  EmailTemplateUpdate,
  EmailTemplateView,
  EmailView
} from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

type Q = Record<string, string | number | undefined>;

export const emailApi = {
  list: (q: EmailListQuery) => api.get<EmailListResponse>('/emails' + qs(q as Q)),
  get: (id: string) => api.get<EmailView>(`/emails/${id}`),
  quota: () => api.get<EmailQuota>('/emails/quota'),
  prefill: (q: EmailPrefillQuery) => api.get<EmailPrefill>('/emails/prefill' + qs(q as unknown as Q)),
  send: (body: EmailSend) => api.post<EmailSendResult>('/emails/send', body),
  resend: (id: string) => api.post<EmailSendResult>(`/emails/${id}/resend`),
  cancel: (id: string) => api.post<EmailView>(`/emails/${id}/cancel`),
  templates: () => api.get<{ items: EmailTemplateView[] }>('/templates'),
  createTemplate: (body: EmailTemplateCreate) => api.post<EmailTemplateView>('/templates', body),
  updateTemplate: (id: string, body: EmailTemplateUpdate) =>
    api.patch<EmailTemplateView>(`/templates/${id}`, body)
};

export const useEmails = (q: EmailListQuery, enabled = true) =>
  useQuery({
    queryKey: ['emails', 'list', q],
    queryFn: () => emailApi.list(q),
    placeholderData: keepPreviousData,
    enabled
  });

export const useEmailQuota = () =>
  useQuery({ queryKey: ['emails', 'quota'], queryFn: emailApi.quota, staleTime: 60_000 });

export const useTemplates = () =>
  useQuery({
    queryKey: ['templates'],
    queryFn: emailApi.templates,
    select: d => d.items,
    staleTime: 5 * 60_000
  });

/** After sending: history, quota, and releases (their mail status) change. */
const useEmailRefresh = () => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['emails'] }),
      qc.invalidateQueries({ queryKey: ['releases'] })
    ]);
};

export const useSendEmail = () => {
  const refresh = useEmailRefresh();
  return useMutation({ mutationFn: emailApi.send, onSuccess: refresh, meta: { silent: true } });
};

export const useEmailActions = () => {
  const refresh = useEmailRefresh();
  return {
    resend: useMutation({ mutationFn: emailApi.resend, onSuccess: refresh }),
    cancel: useMutation({ mutationFn: emailApi.cancel, onSuccess: refresh })
  };
};

export const useSaveTemplate = (id?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: EmailTemplateCreate) =>
      id ? emailApi.updateTemplate(id, body) : emailApi.createTemplate(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
    meta: { silent: true }
  });
};
