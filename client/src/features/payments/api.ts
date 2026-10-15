import type {
  InvoicePaperData,
  PaymentCreate,
  PaymentListQuery,
  PaymentListResponse,
  PaymentRecorded,
  PaymentView
} from '@dsol/shared';
import { api, qs } from '@/lib/api';

type Q = Record<string, string | number | undefined>;

export const paymentsApi = {
  list: (q: PaymentListQuery) => api.get<PaymentListResponse>('/payments' + qs(q as Q)),
  get: (id: string) =>
    api.get<{ payment: PaymentView; seller: InvoicePaperData['seller']; balancePaise: number }>(
      `/payments/${id}`
    ),
  record: (body: PaymentCreate) => api.post<PaymentRecorded>('/payments', body),
  exportCsv: (q: PaymentListQuery) => api.download('/payments/export.csv' + qs(q as Q), 'payments.csv'),
  receiptUrl: (id: string) => `${import.meta.env.VITE_API_BASE || '/api'}/payments/${id}/receipt`
};
