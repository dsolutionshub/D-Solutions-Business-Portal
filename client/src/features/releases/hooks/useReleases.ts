import type { ReleaseBill, ReleaseCreate, ReleaseListQuery } from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useBillingRefresh } from '@/lib/billingRefresh';
import { releasesApi } from '../api';

/* ------------------------------------------------------------- releases */

export const useReleases = (q: ReleaseListQuery) =>
  useQuery({
    queryKey: ['releases', 'list', q],
    queryFn: () => releasesApi.list(q),
    placeholderData: keepPreviousData
  });

export const useSaveRelease = (id?: string) => {
  const refresh = useBillingRefresh();
  return useMutation({
    mutationFn: (body: ReleaseCreate) => (id ? releasesApi.update(id, body) : releasesApi.create(body)),
    onSuccess: refresh,
    meta: { silent: true }
  });
};

export const useReleaseActions = () => {
  const refresh = useBillingRefresh();
  return {
    markDeployed: useMutation({
      mutationFn: releasesApi.markDeployed,
      onSuccess: r => {
        toast.success(`${r.version} marked as deployed`);
        return refresh();
      }
    }),
    remove: useMutation({ mutationFn: releasesApi.remove, onSuccess: refresh }),
    bill: useMutation({
      mutationFn: (v: { id: string; body: ReleaseBill }) => releasesApi.bill(v.id, v.body),
      onSuccess: refresh
    })
  };
};
