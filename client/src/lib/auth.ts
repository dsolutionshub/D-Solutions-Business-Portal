import { can, type Me, type Permission } from '@dsol/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const meQuery = {
  queryKey: ['me'],
  queryFn: () => api.get<Me>('/me'),
  staleTime: 5 * 60_000
} as const;

/** The signed-in user (from Cloudflare Access) and their role. */
export const useMe = () => useQuery(meQuery);

/** Does the signed-in user's role allow this? (The server enforces the same table.) */
export function useCan(permission: Permission): boolean {
  const { data } = useMe();
  return can(data?.user, permission);
}
