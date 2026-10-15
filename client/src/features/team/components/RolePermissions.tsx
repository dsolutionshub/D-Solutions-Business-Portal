import {
  ASSIGNABLE_PERMISSIONS,
  can,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  roleInputSchema,
  type Permission,
  type RoleView
} from '@dsol/shared';
import { Check, ChevronRight, Loader2, Lock, Minus, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { Field } from '@/components/common/Field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useRoleActions, useRoles } from '../api';

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

/**
 * Roles as a list: pick one to see what it allows. Admin is built in and has every permission;
 * Admins create other roles and choose what each may do — the server enforces exactly this.
 */
export function RolePermissions() {
  const roles = useRoles();
  const canManage = useCan('team.manage');
  const { remove } = useRoleActions();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<RoleView | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoleView | null>(null);

  const list = roles.data;
  const shown = useMemo(
    () => (list ?? []).filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase())),
    [list, q]
  );
  const current = list?.find(r => r.name === selected) ?? list?.[0] ?? null;

  if (roles.error) return <ErrorState error={roles.error} onRetry={roles.refetch} />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <p className="text-sm text-muted-foreground">
          Admin is built in and can do everything. Create a role for anyone else and choose what it can do.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> New role
          </Button>
        )}
      </div>

      {!list ? (
        <div className="space-y-2 p-5" aria-busy>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row">
          {/* the roles */}
          <div className="border-b md:w-[300px] md:shrink-0 md:border-b-0 md:border-r">
            {list.length > 6 && (
              <div className="relative border-b p-3">
                <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search roles"
                  aria-label="Search roles"
                  className="pl-8"
                />
              </div>
            )}
            <ul aria-label="Roles" className="max-h-[560px] overflow-y-auto p-2">
              {shown.map(r => {
                const active = current?.name === r.name;
                return (
                  <li key={r.name}>
                    <button
                      type="button"
                      aria-current={active || undefined}
                      onClick={() => setSelected(r.name)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        active ? 'bg-primary/10' : 'hover:bg-muted/60'
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <span className="truncate">{r.name}</span>
                          {r.builtin && (
                            <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Built in" />
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {people(r.members)} · {r.permissions.length} of {PERMISSION_KEYS.length} permissions
                        </span>
                      </span>
                      <ChevronRight
                        className={cn(
                          'size-4 shrink-0',
                          active ? 'text-primary' : 'text-muted-foreground/60'
                        )}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="px-3 py-4 text-sm text-muted-foreground">No role matches.</li>}
            </ul>
            {list.every(r => r.builtin) && (
              <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                No custom roles yet.{canManage && ' Use “New role” to add one, e.g. Developer or Accounts.'}
              </p>
            )}
          </div>

          {/* what the selected role allows */}
          {current && (
            <section className="min-w-0 flex-1" aria-label={`${current.name} permissions`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    {current.name}
                    {current.builtin && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Built in
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3.5" /> {people(current.members)} ·{' '}
                    {current.builtin
                      ? 'Every permission; can’t be changed'
                      : `${current.permissions.length} of ${PERMISSION_KEYS.length} permissions`}
                  </p>
                </div>
                {canManage && !current.builtin && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(current)}>
                      <Pencil /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(current)}
                    >
                      <Trash2 /> Delete
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid gap-5 px-5 py-4">
                {PERMISSION_GROUPS.map(g => (
                  <div key={g.title}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
                      {g.title}
                    </h3>
                    <ul className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
                      {g.items.map(p => {
                        const ok = can(current, p.key);
                        return (
                          <li
                            key={p.key}
                            className={cn('flex items-start gap-2', !ok && 'text-muted-foreground')}
                          >
                            {ok ? (
                              <Check className="mt-0.5 size-4 shrink-0 text-ok" aria-label="Allowed" />
                            ) : (
                              <Minus
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
                                aria-label="Not allowed"
                              />
                            )}
                            {p.label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <RoleDialog
        role={editing}
        onOpenChange={o => !o && setEditing(null)}
        onSaved={r => setSelected(r.name)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        title={`Delete the ${deleting?.name} role?`}
        description={
          deleting?.members
            ? `${people(deleting.members)} ${deleting.members === 1 ? 'has' : 'have'} this role. Give them another role first (Users → ⋯ → Change role).`
            : 'Nobody has this role. This can’t be undone.'
        }
        confirmLabel="Delete role"
        pending={remove.isPending}
        onConfirm={() =>
          deleting?.id &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(`${deleting.name} role deleted`);
              setSelected(null);
            },
            onSettled: () => setDeleting(null)
          })
        }
      />
    </div>
  );
}

/** Create a role, or rename it and change its permissions. */
function RoleDialog({
  role,
  onOpenChange,
  onSaved
}: {
  role: RoleView | 'new' | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (role: RoleView) => void;
}) {
  const { create, update } = useRoleActions();
  const isNew = role === 'new';
  const current = role === 'new' ? null : role;
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<Permission>>(new Set());
  const [errors, setErrors] = useState<{ name?: string; permissions?: string }>({});

  useEffect(() => {
    if (!role) return;
    setName(isNew ? '' : role.name);
    setPicked(
      new Set(
        isNew
          ? ['clients.read', 'projects.read', 'alerts.read', 'settings.read', 'team.read']
          : role.permissions
      )
    );
    setErrors({});
  }, [role, isNew]);

  const toggle = (p: Permission, on: boolean) =>
    setPicked(prev => {
      const next = new Set(prev);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });

  const pending = create.isPending || update.isPending;
  const save = async () => {
    const parsed = roleInputSchema.safeParse({ name, permissions: [...picked] });
    if (!parsed.success) {
      const e: typeof errors = {};
      for (const i of parsed.error.issues) e[i.path[0] as 'name' | 'permissions'] ??= i.message;
      return setErrors(e);
    }
    try {
      const saved =
        isNew || !role
          ? await create.mutateAsync(parsed.data)
          : await update.mutateAsync({ id: role.id!, body: parsed.data });
      toast.success(isNew ? `${saved.name} role created` : `${saved.name} role saved`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fields?.name) setErrors({ name: err.fields.name });
      else toast.error(err instanceof Error ? err.message : 'Could not save the role.');
    }
  };

  return (
    <Dialog open={!!role} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{current ? `Edit role · ${current.name}` : 'New role'}</DialogTitle>
          <DialogDescription>
            Pick what people with this role can do. Changes apply to them straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Role name" required error={errors.name}>
            <Input
              value={name}
              maxLength={40}
              placeholder="e.g. Developer, Accounts, Support"
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </Field>
        </div>
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto border-y px-6 py-3">
          {errors.permissions && (
            <p role="alert" className="mb-2 text-xs text-destructive">
              {errors.permissions}
            </p>
          )}
          {PERMISSION_GROUPS.map(g => {
            const items = g.items.filter(p => ASSIGNABLE_PERMISSIONS.includes(p.key));
            const all = items.every(p => picked.has(p.key));
            return (
              <fieldset key={g.title} className="mb-4 last:mb-0">
                <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
                  {g.title}
                  <button
                    type="button"
                    className="text-[11px] font-medium normal-case tracking-normal text-primary-soft-foreground hover:underline"
                    onClick={() => items.forEach(p => toggle(p.key, !all))}
                  >
                    {all ? 'Clear all' : 'Select all'}
                  </button>
                </legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {items.map(p => (
                    <label
                      key={p.key}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/60',
                        picked.has(p.key) && 'bg-primary/5'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
                        checked={picked.has(p.key)}
                        onChange={e => toggle(p.key, e.target.checked)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
          <p className="mt-2 text-xs text-muted-foreground">
            Inviting people, changing roles and running the daily job by hand stay with Admins.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <span className="mr-auto self-center text-xs text-muted-foreground">{picked.size} selected</span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {isNew ? 'Create role' : 'Save role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
