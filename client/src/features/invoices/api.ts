import type {
  InvoiceCreateInput,
  InvoiceDetail,
  InvoiceDraft,
  InvoiceListQuery,
  InvoiceListResponse,
  InvoiceUpdate
} from '@dsol/shared';
import { api, qs } from '@/lib/api';

type Q = Record<string, string | number | undefined>;

export const invoicesApi = {
  list: (q: InvoiceListQuery) => api.get<InvoiceListResponse>('/invoices' + qs(q as Q)),
  get: (no: string) => api.get<InvoiceDetail>(`/invoices/${encodeURIComponent(no)}`),
  defaults: (client?: string) => api.get<InvoiceDraft>('/invoices/new' + qs({ client })),
  fromWork: (ids: string[]) => api.get<InvoiceDraft>('/invoices/new-from-work' + qs({ ids: ids.join(',') })),
  create: (body: InvoiceCreateInput) => api.post<InvoiceDetail>('/invoices', body),
  update: (no: string, body: InvoiceUpdate) =>
    api.patch<InvoiceDetail>(`/invoices/${encodeURIComponent(no)}`, body),
  issue: (no: string) => api.post<InvoiceDetail>(`/invoices/${encodeURIComponent(no)}/issue`),
  void: (no: string) => api.post<InvoiceDetail>(`/invoices/${encodeURIComponent(no)}/void`),
  duplicate: (no: string) => api.post<InvoiceDetail>(`/invoices/${encodeURIComponent(no)}/duplicate`),
  /** Opens the printable page in a new tab ("Save as PDF" in the print dialog). */
  pdfUrl: (no: string) => `${import.meta.env.VITE_API_BASE || '/api'}/invoices/${encodeURIComponent(no)}/pdf`
};
