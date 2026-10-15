/** Roles: Admin (built in) plus the custom roles an Admin creates. */
import type { RoleInput, RoleUpdate, RoleView } from '@dsol/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const rolesApi = {
  list: () => api.get<{ items: RoleView[] }>('/roles'),
  create: (body: RoleInput) => api.post<RoleView>('/roles', body),
  update: (id: string, body: RoleUpdate) => api.patch<RoleView>(`/roles/${id}`, body),
  remove: (id: string) => api.delete(`/roles/${id}`)
};

export const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: rolesApi.list, select: d => d.items });

export const useRoleActions = () => {
  const qc = useQueryClient();
  // a rename changes people's role too; a permission change changes what the app shows
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['roles'] }),
      qc.invalidateQueries({ queryKey: ['users'] }),
      qc.invalidateQueries({ queryKey: ['me'] })
    ]);
  return {
    create: useMutation({ mutationFn: rolesApi.create, onSuccess: refresh, meta: { silent: true } }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: RoleUpdate }) => rolesApi.update(id, body),
      onSuccess: refresh,
      meta: { silent: true }
    }),
    remove: useMutation({ mutationFn: rolesApi.remove, onSuccess: refresh })
  };
};
