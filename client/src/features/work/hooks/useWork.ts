import type { WorkItemCreate, WorkItemUpdate, WorkListQuery } from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useBillingRefresh } from '@/lib/billingRefresh';
import { workApi } from '../api';

/* ----------------------------------------------------------------- work */

export const useWork = (q: WorkListQuery, enabled = true) =>
  useQuery({
    queryKey: ['work', 'list', q],
    queryFn: () => workApi.list(q),
    placeholderData: keepPreviousData,
    enabled
  });

export const useSaveWork = (id?: string) => {
  const refresh = useBillingRefresh();
  return useMutation({
    mutationFn: (body: WorkItemCreate | WorkItemUpdate) =>
      id ? workApi.update(id, body) : workApi.create(body as WorkItemCreate),
    onSuccess: refresh,
    meta: { silent: true }
  });
};

export const useWorkActions = () => {
  const refresh = useBillingRefresh();
  return {
    remove: useMutation({ mutationFn: workApi.remove, onSuccess: refresh }),
    toggleBillable: useMutation({
      mutationFn: workApi.toggleBillable,
      onSuccess: w => {
        toast.success(
          w.billing === 'Free'
            ? `${w.title} marked as not billable`
            : `${w.title} is billable again — add a price`
        );
        return refresh();
      }
    })
  };
};
