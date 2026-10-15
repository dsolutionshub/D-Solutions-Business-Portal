import type { PaymentCreate, PaymentListQuery } from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useBillingRefresh } from '@/lib/billingRefresh';
import { paymentsApi } from '../api';

/* ------------------------------------------------------------- payments */

export const usePayments = (q: PaymentListQuery, enabled = true) =>
  useQuery({
    queryKey: ['payments', 'list', q],
    queryFn: () => paymentsApi.list(q),
    placeholderData: keepPreviousData,
    enabled
  });

export const useRecordPayment = () => {
  const refresh = useBillingRefresh();
  return useMutation({
    mutationFn: (body: PaymentCreate) => paymentsApi.record(body),
    onSuccess: refresh,
    meta: { silent: true }
  });
};
