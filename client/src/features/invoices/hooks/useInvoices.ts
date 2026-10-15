import type { InvoiceCreateInput, InvoiceListQuery, InvoiceUpdate } from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useBillingRefresh } from '@/lib/billingRefresh';
import { invoicesApi } from '../api';

/* ------------------------------------------------------------- invoices */

export const useInvoices = (q: InvoiceListQuery, enabled = true) =>
  useQuery({
    queryKey: ['invoices', 'list', q],
    queryFn: () => invoicesApi.list(q),
    placeholderData: keepPreviousData,
    enabled
  });

export const useInvoice = (no: string | undefined) =>
  useQuery({ queryKey: ['invoices', 'detail', no], queryFn: () => invoicesApi.get(no!), enabled: !!no });

export const useSaveInvoice = (no?: string) => {
  const refresh = useBillingRefresh();
  return useMutation({
    mutationFn: (body: InvoiceCreateInput) =>
      no ? invoicesApi.update(no, body as InvoiceUpdate) : invoicesApi.create(body),
    onSuccess: refresh,
    meta: { silent: true }
  });
};

export const useInvoiceActions = () => {
  const refresh = useBillingRefresh();
  return {
    issue: useMutation({
      mutationFn: invoicesApi.issue,
      onSuccess: v => {
        toast.success(`${v.number} issued`);
        return refresh();
      }
    }),
    void: useMutation({
      mutationFn: invoicesApi.void,
      onSuccess: v => {
        toast.success(
          `${v.number} voided${v.work.length ? ` · ${v.work.length} work item(s) back to To bill` : ''}`
        );
        return refresh();
      }
    }),
    duplicate: useMutation({
      mutationFn: invoicesApi.duplicate,
      onSuccess: v => {
        toast.success(`Draft ${v.number} created (delivered work isn’t billed again)`);
        return refresh();
      }
    })
  };
};
