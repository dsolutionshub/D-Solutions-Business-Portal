import type {
  ClientCreateInput,
  ClientListQuery,
  ClientListResponse,
  ClientUpdate,
  ClientView,
  Contact,
  ContactCreate,
  ContactUpdate
} from '@dsol/shared';
import { api, qs } from '@/lib/api';

export const clientsApi = {
  list: (q: ClientListQuery) =>
    api.get<ClientListResponse>('/clients' + qs(q as Record<string, string | number | undefined>)),
  get: (id: string) => api.get<ClientView>(`/clients/${id}`),
  create: (body: ClientCreateInput) => api.post<ClientView>('/clients', body),
  update: (id: string, body: ClientUpdate) => api.patch<ClientView>(`/clients/${id}`, body),
  archive: (id: string) => api.post<ClientView>(`/clients/${id}/archive`),
  restore: (id: string) => api.post<ClientView>(`/clients/${id}/restore`),
  remove: (id: string) => api.delete(`/clients/${id}`),
  uploadLogo: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<ClientView>(`/clients/${id}/logo`, form);
  },
  removeLogo: (id: string) => api.delete<ClientView>(`/clients/${id}/logo`),
  exportCsv: () => api.download('/clients/export.csv', 'clients.csv'),
  exportJson: (id: string) => api.download(`/clients/${id}/export`, 'client-export.json'),
  contacts: (id: string) => api.get<{ items: Contact[] }>(`/clients/${id}/contacts`),
  addContact: (clientId: string, body: Omit<ContactCreate, 'clientId'>) =>
    api.post<Contact>(`/clients/${clientId}/contacts`, body),
  updateContact: (id: string, body: ContactUpdate) => api.patch<Contact>(`/contacts/${id}`, body),
  deleteContact: (id: string) => api.delete(`/contacts/${id}`)
};
