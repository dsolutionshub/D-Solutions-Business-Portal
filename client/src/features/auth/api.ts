/** Sign in / out, forgot and reset password, change password. */
import type { ChangePasswordInput, LoginInput, Me, ResetPasswordInput } from '@dsol/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { meQuery } from '@/lib/auth';

export const authApi = {
  login: (body: LoginInput) => api.post<Me>('/auth/login', body),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  forgot: (email: string) => api.post<{ ok: true; devLink?: string }>('/auth/forgot', { email }),
  reset: (body: ResetPasswordInput) => api.post<{ ok: true }>('/auth/reset', body),
  session: () => api.get<{ user: Me['user'] }>('/auth/session'),
  changePassword: (body: ChangePasswordInput) => api.post<{ ok: true }>('/account/password', body),
  passwordLink: (userId: string) =>
    api.post<{ status: string; devLink?: string }>(`/users/${userId}/password-link`)
};

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: me => {
      // a fresh start: nothing cached from a previous person
      qc.clear();
      qc.setQueryData(meQuery.queryKey, me);
    },
    meta: { silent: true }
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: authApi.logout, onSettled: () => qc.clear(), meta: { silent: true } });
};

/** Whether someone is already signed in with a portal password (public pages; never a 401). */
export const useSignedIn = () =>
  useQuery({ queryKey: ['auth', 'session'], queryFn: authApi.session, retry: false, select: s => s.user });
