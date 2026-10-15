import { formatDate, NOTICE_TYPES, todayIso, type NoticeCreate } from '@dsol/shared';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { useNoticeActions, useNotices } from '../api';

type Values = { title: string; body: string; date: string; type: NoticeCreate['type'] };

/** Notices you add yourself (e.g. a maintenance window): they show as alerts until the day passes. */
export function NoticesPanel() {
  const q = useNotices();
  const { add, remove } = useNoticeActions();
  const canWrite = useCan('notices.write');
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const { register, handleSubmit, reset, setError, formState } = useForm<Values>({
    defaultValues: { title: '', body: '', date: todayIso(), type: 'Upcoming maintenance' }
  });
  const e = formState.errors;

  const submit = handleSubmit(async v => {
    if (!v.title.trim()) return setError('title', { message: 'Give the notice a title.' });
    if (!v.date) return setError('date', { message: 'Pick a date.' });
    if (v.date < todayIso()) return setError('date', { message: 'Pick today or a later date.' });
    try {
      await add.mutateAsync({
        title: v.title.trim(),
        body: v.body.trim() || null,
        date: v.date,
        type: v.type
      });
      toast.success('Notice added');
      reset({ title: '', body: '', date: v.date, type: v.type });
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <h2 className="mb-2 text-[15px] font-semibold">Notices</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Shown in everyone’s bell inside the reminder window for their type, until the date passes.
        </p>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <Skeleton className="h-24" />
        ) : q.data.length ? (
          <ul className="divide-y rounded-lg border">
            {q.data.map(n => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {n.title}
                    <StatusBadge status={n.type} tone={n.date < todayIso() ? 'muted' : 'info'} dot={false} />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatDate(n.date)}
                    {n.body && ` · ${n.body}`}
                    {n.createdByName && ` · by ${n.createdByName}`}
                  </div>
                </div>
                {canWrite && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${n.title}`}
                    onClick={() => setRemoving(n)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No notices"
            description="Add one for planned maintenance or anything the team should know."
          />
        )}
      </div>
      {canWrite && (
        <form noValidate onSubmit={submit} className="flex flex-col gap-3 rounded-lg border p-4">
          <h3 className="font-semibold">Add a notice</h3>
          <Field label="Title" required error={e.title?.message}>
            <Input placeholder="e.g. Kaveri maintenance window" {...register('title')} />
          </Field>
          <Field label="Details">
            <Input placeholder="e.g. 1:00–2:00 AM IST · clients notified" {...register('body')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required error={e.date?.message}>
              <Input type="date" min={todayIso()} {...register('date')} />
            </Field>
            <Field label="Type">
              <NativeSelect {...register('type')}>
                {NOTICE_TYPES.map(t => (
                  <option key={t}>{t}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Button type="submit" disabled={add.isPending} className="self-end">
            {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add notice
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={o => !o && setRemoving(null)}
        title={`Remove “${removing?.title}”?`}
        description="It disappears from everyone’s notifications."
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSettled: () => setRemoving(null),
            onSuccess: () => toast.success('Notice removed')
          })
        }
      />
    </div>
  );
}
