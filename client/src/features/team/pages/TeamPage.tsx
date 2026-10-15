import { isBuiltinRole, type Role, type TeamMember } from '@dsol/shared';
import { KeyRound, Loader2, Pencil, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { PageTabs } from '@/components/common/PageTabs';
import { RowMenu } from '@/components/common/RowMenu';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { StatusBadge, type BadgeTone } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useCan, useMe } from '@/lib/auth';
import { initials } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { authApi } from '@/features/auth/api';
import { useTeamActions, useTeamMembers } from '@/features/settings/api';
import { useRoles } from '../api';
import { RolePermissions } from '../components/RolePermissions';

const roleTone = (role: Role, exists: boolean): BadgeTone =>
  role === 'Admin' ? 'primary' : exists ? 'info' : 'muted';

const STATS: [string, ((u: TeamMember) => boolean) | null][] = [
  ['Admins', u => u.role === 'Admin'],
  ['Other roles', u => !isBuiltinRole(u.role)],
  ['Invited', u => u.status === 'Invited'],
  ['Deactivated', null]
];

const lastLogin = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      })
    : '—';

export function TeamPage() {
  const canManage = useCan('team.manage');
  const [inviting, setInviting] = useState(false);
  const team = useTeamMembers();
  return (
    <>
      <PageHeader
        title="Team & Permissions"
        actions={
          canManage && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Invite user
            </Button>
          )
        }
      />
      <StatGrid>
        {STATS.map(([label, match]) => (
          <StatCard
            key={label}
            label={label}
            value={
              team.data
                ? team.data.filter(u =>
                    match ? u.status !== 'Deactivated' && match(u) : u.status === 'Deactivated'
                  ).length
                : '—'
            }
            loading={team.isLoading}
          />
        ))}
      </StatGrid>
      <PageTabs
        defaultTab="users"
        tabs={[
          { value: 'users', label: 'Users', count: team.data?.length, content: <UsersTab /> },
          { value: 'roles', label: 'Role permissions', content: <RolePermissions /> }
        ]}
      />
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </>
  );
}

function UsersTab() {
  const team = useTeamMembers();
  const roles = useRoles();
  const roleNames = (roles.data ?? []).map(r => r.name);
  const me = useMe().data?.user;
  const canManage = useCan('team.manage');
  const { update } = useTeamActions();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [toggling, setToggling] = useState<TeamMember | null>(null);

  const rows = useMemo(
    () =>
      (team.data ?? []).filter(
        u =>
          (!role || u.role === role) &&
          (!q || (u.name + ' ' + u.email).toLowerCase().includes(q.toLowerCase()))
      ),
    [team.data, q, role]
  );

  const columns: Column<TeamMember>[] = [
    {
      id: 'user',
      header: 'User',
      cell: u => (
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">
            {initials(u.name)}
          </span>
          <span className="font-semibold">
            {u.name}
            {u.id === me?.id && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
            )}
          </span>
        </span>
      )
    },
    { id: 'email', header: 'Email', cell: u => <span className="text-muted-foreground">{u.email}</span> },
    {
      id: 'role',
      header: 'Role',
      cell: u => {
        const exists = !roles.data || roleNames.includes(u.role);
        return (
          <StatusBadge
            status={exists ? u.role : `${u.role} (removed)`}
            tone={roleTone(u.role, exists)}
            dot={false}
            title={
              exists ? undefined : 'This role no longer exists. Give them a new role to reactivate them.'
            }
          />
        );
      }
    },
    { id: 'status', header: 'Status', cell: u => <StatusBadge status={u.status} /> },
    {
      id: 'last',
      header: 'Last login',
      cell: u => <span className="whitespace-nowrap text-muted-foreground">{lastLogin(u.lastLoginAt)}</span>
    },
    {
      id: 'menu',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: u =>
        canManage && u.id !== me?.id ? (
          <RowMenu label={`Actions for ${u.name}`}>
            <DropdownMenuItem onSelect={() => setEditing(u)}>
              <Pencil /> Change role
            </DropdownMenuItem>
            {u.status !== 'Deactivated' && (
              <DropdownMenuItem onSelect={() => void sendLink(u)}>
                <KeyRound /> Email a password link
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {u.status === 'Deactivated' ? (
              <DropdownMenuItem onSelect={() => setToggling(u)}>
                <UserCheck /> Reactivate
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setToggling(u)}
              >
                <UserX /> Deactivate
              </DropdownMenuItem>
            )}
          </RowMenu>
        ) : null
    }
  ];

  /** Set-password (never signed in yet) or reset link, emailed to them. */
  const sendLink = async (u: TeamMember) => {
    try {
      const r = await authApi.passwordLink(u.id);
      if (r.status === 'Failed') toast.error(`Couldn’t email ${u.email}. Check Email Center for the error.`);
      else
        toast.success(`Password link emailed to ${u.email}`, {
          ...(r.devLink
            ? { action: { label: 'Open (dev)', onClick: () => window.open(r.devLink, '_blank', 'noopener') } }
            : {})
        });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the link.');
    }
  };

  const deactivating = toggling?.status !== 'Deactivated';
  return (
    <>
      <div className="flex flex-wrap gap-2 border-b px-4 py-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search name or email" />
        <NativeSelect
          value={role}
          onChange={e => setRole(e.target.value)}
          aria-label="Role"
          className="w-[160px]"
        >
          <option value="">All roles</option>
          {roleNames.map(r => (
            <option key={r}>{r}</option>
          ))}
        </NativeSelect>
      </div>
      <DataTable
        label="Team"
        columns={columns}
        rows={team.data ? rows : undefined}
        getRowId={u => u.id}
        loading={team.isLoading}
        error={team.error}
        onRetry={team.refetch}
        empty={<EmptyState title="No users" description="No team members match." />}
      />
      <RoleDialog user={editing} onOpenChange={o => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={o => !o && setToggling(null)}
        title={`${deactivating ? 'Deactivate' : 'Reactivate'} ${toggling?.name}?`}
        description={
          deactivating
            ? 'They lose access immediately — the portal refuses their requests. Their history is kept and you can reactivate them later.'
            : 'They can sign in again with their work email.'
        }
        confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
        destructive={deactivating}
        pending={update.isPending}
        onConfirm={() =>
          toggling &&
          update.mutate(
            { id: toggling.id, body: { status: deactivating ? 'Deactivated' : 'Active' } },
            {
              onSuccess: u => toast.success(`${u.name} ${deactivating ? 'deactivated' : 'reactivated'}`),
              onSettled: () => setToggling(null)
            }
          )
        }
      />
    </>
  );
}

function RoleDialog({ user, onOpenChange }: { user: TeamMember | null; onOpenChange: (o: boolean) => void }) {
  const { update } = useTeamActions();
  const roles = useRoles();
  const [role, setRole] = useState<Role>('');
  const names = (roles.data ?? []).map(r => r.name);
  useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);
  const removed = !!user && !!roles.data && !names.includes(user.role);
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change role · {user?.name}</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <Field
          label="Role"
          hint="See Role permissions for what each role can do. There is always at least one active Admin."
        >
          <NativeSelect value={role} onChange={e => setRole(e.target.value)}>
            {removed && (
              <option value={user!.role} disabled>
                {user!.role} (removed)
              </option>
            )}
            {names.map(r => (
              <option key={r}>{r}</option>
            ))}
          </NativeSelect>
        </Field>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={update.isPending || role === user?.role || !names.includes(role)}
            onClick={() =>
              user &&
              update.mutate(
                { id: user.id, body: { role } },
                { onSuccess: u => (toast.success(`${u.name} is now ${u.role}`), onOpenChange(false)) }
              )
            }
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type InviteValues = { name: string; email: string; role: Role };

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { invite } = useTeamActions();
  const roles = useRoles();
  // custom roles first, then Admin
  const choices = [...(roles.data ?? [])].sort((a, b) => Number(a.builtin) - Number(b.builtin));
  const { register, handleSubmit, reset, setError, formState } = useForm<InviteValues>();
  const e = formState.errors;
  const first = choices[0]?.name ?? 'Admin';
  useEffect(() => {
    if (open) reset({ name: '', email: '', role: first });
  }, [open, reset, first]);

  const submit = handleSubmit(async v => {
    if (!v.name.trim()) return setError('name', { message: 'Name is required.' });
    if (!v.email.trim()) return setError('email', { message: 'Email is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()))
      return setError('email', { message: 'Enter a valid email address.' });
    try {
      const u = (await invite.mutateAsync({
        name: v.name.trim(),
        email: v.email.trim(),
        role: v.role
      })) as TeamMember & {
        passwordEmail?: { status: string; devLink?: string };
      };
      if (u.passwordEmail?.status === 'Failed')
        toast.warning(
          `${u.name} added, but the invite email failed. Use ⋯ → Email a password link to try again.`
        );
      else
        toast.success(`${u.name} invited — they’ll get an email to set their password`, {
          ...(u.passwordEmail?.devLink
            ? {
                action: {
                  label: 'Open link (dev)',
                  onClick: () => window.open(u.passwordEmail!.devLink, '_blank', 'noopener')
                }
              }
            : {})
        });
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              They get an email with a link to set their password (valid 72 hours) and show as Invited until
              their first sign-in.
            </DialogDescription>
          </DialogHeader>
          <Field label="Full name" required error={e.name?.message}>
            <Input {...register('name')} />
          </Field>
          <Field label="Work email" required error={e.email?.message}>
            <Input type="email" {...register('email')} />
          </Field>
          <Field
            label="Role"
            error={e.role?.message}
            hint="Need a different set of permissions? Create a role on the Role permissions tab."
          >
            <NativeSelect {...register('role')}>
              {choices.map(r => (
                <option key={r.name}>{r.name}</option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending && <Loader2 className="animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
