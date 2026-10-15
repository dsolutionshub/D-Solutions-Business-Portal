import type { ClientView, Contact } from '@dsol/shared';
import { Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/lib/auth';
import { useContacts, useDeleteContact, useUpdateContact } from '../hooks/useClients';
import { AddContactDialog } from './AddContactDialog';

/** People who receive releases, maintenance notices and invoices. */
export function ContactsTab({ client }: { client: ClientView }) {
  const { data, isLoading, error, refetch } = useContacts(client.id);
  const update = useUpdateContact(client.id);
  const remove = useDeleteContact(client.id);
  const canWrite = useCan('clients.write') && !client.archivedAt;
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Contact | null>(null);

  const columns: Column<Contact>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: p => (
        <div>
          <div className="font-semibold">{p.name}</div>
          {p.role && <div className="text-xs text-muted-foreground">{p.role}</div>}
        </div>
      )
    },
    {
      id: 'email',
      header: 'Email',
      cell: p => (
        <a href={`mailto:${p.email}`} className="text-primary-soft-foreground hover:underline">
          {p.email}
        </a>
      )
    },
    { id: 'phone', header: 'Phone', cell: p => p.phone ?? '—' },
    {
      id: 'tag',
      header: 'Type',
      cell: p => <StatusBadge status={p.tag} tone={p.tag === 'Primary' ? 'primary' : 'muted'} dot={false} />
    },
    {
      id: 'notify',
      header: 'Release emails',
      cell: p => (
        <Switch
          checked={p.notifyReleases}
          disabled={!canWrite}
          aria-label={`Release emails for ${p.name}`}
          onCheckedChange={v =>
            update.mutate(
              { id: p.id, body: { notifyReleases: v } },
              { onSuccess: () => toast.success(`Release emails ${v ? 'on' : 'off'} for ${p.name}`) }
            )
          }
        />
      )
    },
    {
      id: 'remove',
      header: <span className="sr-only">Remove</span>,
      align: 'right',
      cell: p =>
        canWrite && p.tag !== 'Primary' ? (
          <Button variant="ghost" size="icon" aria-label={`Remove ${p.name}`} onClick={() => setRemoving(p)}>
            <Trash2 />
          </Button>
        ) : null
    }
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">Contacts</h2>
          <p className="text-xs text-muted-foreground">
            People who receive releases, maintenance notices and invoices. The primary contact is edited on
            the client form.
          </p>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add contact
          </Button>
        )}
      </div>
      <DataTable
        label="Contacts"
        columns={columns}
        rows={data}
        getRowId={p => p.id}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        empty={
          <EmptyState
            icon={Users}
            title="No contacts"
            description="Add a contact to start sending updates."
          />
        }
      />
      <AddContactDialog
        clientId={client.id}
        clientName={client.name}
        open={adding}
        onOpenChange={setAdding}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={o => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They will no longer receive emails from this portal. Past email history is kept."
        confirmLabel="Remove contact"
        pending={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () => toast.success(`${removing.name} removed`),
            onSettled: () => setRemoving(null)
          })
        }
      />
    </>
  );
}
