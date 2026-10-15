import type { ClientListQuery, ClientUpdate, Contact, ContactCreate, ContactUpdate } from '@dsol/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clientsApi } from '../api';

export const clientKeys = {
  all: ['clients'] as const,
  list: (q: ClientListQuery) => ['clients', 'list', q] as const,
  detail: (id: string) => ['clients', 'detail', id] as const,
  contacts: (id: string) => ['clients', 'contacts', id] as const
};

export const useClientsList = (q: ClientListQuery) =>
  useQuery({
    queryKey: clientKeys.list(q),
    queryFn: () => clientsApi.list(q),
    placeholderData: keepPreviousData
  });

/** Every non-archived client, for pickers and the "Switch client" menu. */
export const useClientOptions = () =>
  useQuery({
    queryKey: clientKeys.list({ pageSize: 100, sort: 'name:asc' }),
    queryFn: () => clientsApi.list({ pageSize: 100, sort: 'name:asc' }),
    select: d => d.items,
    staleTime: 60_000
  });

export const useClient = (id: string | undefined) =>
  useQuery({ queryKey: clientKeys.detail(id ?? ''), queryFn: () => clientsApi.get(id!), enabled: !!id });

/** After any change: refresh lists and this client (and project lists, which show client names). */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: clientKeys.all }),
      qc.invalidateQueries({ queryKey: ['projects'] })
    ]);
}

/** Form saves handle their own errors (field messages), so they are `silent` to the global toast. */
export const useCreateClient = () => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: clientsApi.create, onSuccess: invalidate, meta: { silent: true } });
};

export const useUpdateClient = (id: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ClientUpdate) => clientsApi.update(id, body),
    onSuccess: invalidate,
    meta: { silent: true }
  });
};

export const useLogo = (id?: string) => {
  const invalidate = useInvalidate();
  return {
    upload: useMutation({
      mutationFn: (v: { id: string; file: File }) => clientsApi.uploadLogo(v.id, v.file),
      onSuccess: invalidate
    }),
    remove: useMutation({
      mutationFn: (clientId: string = id!) => clientsApi.removeLogo(clientId),
      onSuccess: invalidate
    })
  };
};

export const useArchiveClient = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: clientsApi.archive,
    onSuccess: c => {
      toast.success(`${c.name} archived`);
      return invalidate();
    }
  });
};

export const useRestoreClient = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: clientsApi.restore,
    onSuccess: c => {
      toast.success(`${c.name} restored`);
      return invalidate();
    }
  });
};

/** Permanent delete of an archived client (refused while it has invoices). */
export const useDeleteClient = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (c: { id: string; name: string }) => clientsApi.remove(c.id),
    onSuccess: (_, c) => {
      toast.success(`${c.name} deleted`);
      return invalidate();
    }
  });
};

/* ------------------------------------------------------------- contacts */

export const useContacts = (clientId: string, enabled = !!clientId) =>
  useQuery({
    queryKey: clientKeys.contacts(clientId),
    queryFn: () => clientsApi.contacts(clientId),
    select: d => d.items,
    enabled
  });

export const useAddContact = (clientId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Omit<ContactCreate, 'clientId'>) => clientsApi.addContact(clientId, body),
    onSuccess: invalidate,
    meta: { silent: true }
  });
};

/** Optimistic: the switch flips at once and rolls back if the save fails. */
export const useUpdateContact = (clientId: string) => {
  const qc = useQueryClient();
  const key = clientKeys.contacts(clientId);
  return useMutation({
    mutationFn: (v: { id: string; body: ContactUpdate }) => clientsApi.updateContact(v.id, v.body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ items: Contact[] }>(key);
      qc.setQueryData<{ items: Contact[] }>(
        key,
        d => d && { items: d.items.map(c => (c.id === id ? { ...c, ...body } : c)) }
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key })
  });
};

/** Contacts are refreshed with the client (same query key root). */
export const useDeleteContact = (_clientId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => clientsApi.deleteContact(id),
    onSuccess: () => invalidate()
  });
};
