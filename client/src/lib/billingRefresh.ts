import { useQueryClient } from '@tanstack/react-query';

/**
 * Releases, work, invoices and payments affect each other (and the client and project pages),
 * so every billing change refreshes all of them.
 */
const BILLING_KEYS = [['releases'], ['work'], ['invoices'], ['payments'], ['clients'], ['projects']];
export function useBillingRefresh() {
  const qc = useQueryClient();
  return () => Promise.all(BILLING_KEYS.map(queryKey => qc.invalidateQueries({ queryKey })));
}
