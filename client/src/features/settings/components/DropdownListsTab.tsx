import { ENV_NAMES, LIST_KEYS, type ListKey } from '@dsol/shared';
import { Loader2, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { FormAccordionSection } from '@/components/common/FormAccordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useLists } from '@/lib/useLists';
import { settingsApi, useListActions } from '../api';

/** Title and hint per list (prototype LIST_INFO). */
const LIST_INFO: Record<ListKey, { title: string; hint: string }> = {
  environments: {
    title: 'Environments',
    hint: 'Project environments and release targets. Short codes work best, e.g. UAT.'
  },
  hosting: { title: 'Hosting platforms', hint: 'Project sheet → Backend deployment & hosting.' },
  registrar: { title: 'Purchased from (registrar)', hint: 'Project sheet → Domain & SSL.' },
  database: { title: 'Databases', hint: 'Project sheet → Database.' },
  payGateway: { title: 'Payment gateways', hint: 'Project sheet → E-commerce keys.' },
  projectType: { title: 'Project types', hint: 'Add / edit project.' },
  businessType: { title: 'Business types', hint: 'Add / edit client.' },
  industry: { title: 'Industries', hint: 'Add / edit client.' },
  state: { title: 'States', hint: 'Client address.' }
};

/** Settings → Dropdown lists: add and remove (with a usage check). */
export function DropdownListsTab() {
  const q = useLists();
  const canEdit = useCan('lists.write');
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="p-5">
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Open a list to add or remove values. New values appear in the matching dropdowns right away; removing
        one keeps it on records that already use it.
      </p>
      {!canEdit && (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Your role can’t change dropdown lists.
        </p>
      )}
      <div className="overflow-hidden rounded-xl border">
        {LIST_KEYS.map(k =>
          q.data ? (
            <ListRow key={k} listKey={k} values={q.data[k]} canEdit={canEdit} />
          ) : (
            <Skeleton key={k} className="m-3 h-10" />
          )
        )}
      </div>
    </div>
  );
}

function ListRow({ listKey, values, canEdit }: { listKey: ListKey; values: string[]; canEdit: boolean }) {
  const { add, remove } = useListActions();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ value: string; count: number; detail: string } | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const info = LIST_INFO[listKey];
  const env = listKey === 'environments';

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const value = env ? draft.toUpperCase().replace(/[^A-Z0-9-]/g, '') : draft.trim();
    if (!value) return setError('Type a value first.');
    if (values.some(v => v.toLowerCase() === value.toLowerCase())) {
      setError(null);
      return void toast.info(`${value} is already in the list`);
    }
    try {
      await add.mutateAsync({ key: listKey, value });
      setDraft('');
      setError(null);
      toast.success(`${value} added`);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields?.value ?? err.message) : 'Could not add the value.');
    }
  };

  const askRemove = async (value: string) => {
    setChecking(value);
    try {
      const u = await settingsApi.usage(listKey, value);
      if (u.count) setRemoving({ value, ...u });
      else
        remove.mutate(
          { key: listKey, value },
          { onSuccess: () => toast.success(`${value} removed from the list`) }
        );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not check where the value is used.');
    } finally {
      setChecking(null);
    }
  };

  return (
    <FormAccordionSection
      title={info.title}
      description={
        <>
          {info.hint} · {values.length} value{values.length === 1 ? '' : 's'}
          {values.length > 0 && (
            <span className="hidden sm:inline">
              : {values.slice(0, 4).join(', ')}
              {values.length > 4 ? '…' : ''}
            </span>
          )}
        </>
      }
    >
      <div className="col-span-full flex flex-col gap-3">
        {values.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={`${info.title} values`}>
            {values.map(v => (
              <li
                key={v}
                className="flex items-center gap-0.5 rounded-md border bg-surface-2 py-0.5 pl-2.5 pr-0.5 text-[13px]"
              >
                <span className="max-w-[220px] truncate">
                  {v}
                  {env && ENV_NAMES[v] && <span className="text-muted-foreground"> · {ENV_NAMES[v]}</span>}
                </span>
                {canEdit && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6 hover:text-destructive"
                      disabled={checking === v}
                      aria-label={`Remove ${v}`}
                      onClick={() => void askRemove(v)}
                    >
                      {checking === v ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <X className="size-3" />
                      )}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No values yet.</p>
        )}
        {canEdit && (
          <form noValidate onSubmit={e => void submit(e)} className="max-w-md">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={e => (setDraft(e.target.value), setError(null))}
                placeholder={env ? 'Add code, e.g. UAT' : 'Add a value'}
                aria-label={`Add to ${info.title}`}
                aria-invalid={!!error || undefined}
                className={env ? 'uppercase placeholder:normal-case' : undefined}
                maxLength={80}
              />
              <Button type="submit" size="sm" variant="outline" disabled={add.isPending} className="h-9">
                <Plus /> Add
              </Button>
            </div>
            {error && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={o => !o && setRemoving(null)}
        title={`Remove “${removing?.value}”?`}
        description={`It is used ${removing?.count} time(s) (${removing?.detail}). Those records keep “${removing?.value}”, but it will no longer be offered for new entries.`}
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(
            { key: listKey, value: removing.value },
            {
              onSuccess: () => toast.success(`${removing.value} removed from the list`),
              onSettled: () => setRemoving(null)
            }
          )
        }
      />
    </FormAccordionSection>
  );
}
