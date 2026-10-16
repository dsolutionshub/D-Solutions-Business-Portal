import {
  ALERT_TYPES,
  DAYS_AFTER_ALERT_TYPES,
  REMINDER_DAY_OPTIONS,
  type AlertType,
  type AlertTypePrefs,
  type NotificationPrefs
} from '@dsol/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { usePrefs, useSavePrefs } from '../api';

/**
 * Notifications → Preferences: reminder days and channels per alert type (one set for the whole
 * team). Roles with “Change settings” edit; everyone else sees them read-only.
 */
export function NotificationPrefsForm() {
  const q = usePrefs();
  const save = useSavePrefs();
  const canEdit = useCan('settings.write');
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  useEffect(() => {
    if (q.data) setPrefs(q.data);
  }, [q.data]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!prefs)
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );

  const set = (t: AlertType, patch: Partial<AlertTypePrefs>) =>
    setPrefs(p => ({ ...p!, [t]: { ...p![t], ...patch } }));
  const toggleDay = (t: AlertType, d: number) => {
    const days = prefs[t].days.includes(d) ? prefs[t].days.filter(x => x !== d) : [...prefs[t].days, d];
    set(t, { days: days.sort((a, b) => b - a) });
  };
  const dirty = JSON.stringify(prefs) !== JSON.stringify(q.data);

  return (
    <div className="p-5">
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        An alert appears when a date is inside the largest interval you pick (and stays until its date is
        moved forward on the project, or the invoice is paid). Untick every interval to turn a type off. The
        daily email digest goes out at 8:00 AM and lists the items whose reminder day is today.
      </p>
      {!canEdit && (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Your role can’t change reminder preferences.
        </p>
      )}
      <div className="divide-y rounded-lg border">
        {ALERT_TYPES.map(t => {
          const p = prefs[t];
          const off = !p.days.length;
          return (
            <fieldset
              key={t}
              disabled={!canEdit}
              className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5"
            >
              <div className="min-w-[200px] flex-1">
                <legend className="font-semibold">{t}</legend>
                <div className="text-xs text-muted-foreground">
                  {off
                    ? 'Off'
                    : DAYS_AFTER_ALERT_TYPES.includes(t)
                      ? 'Reminder intervals (days after due)'
                      : 'Reminder intervals (days before)'}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${t} reminder days`}>
                {REMINDER_DAY_OPTIONS.map(d => {
                  const on = p.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(t, d)}
                      className={cn(
                        'h-7 min-w-10 rounded-full border px-2.5 text-xs font-medium text-subtle-foreground disabled:opacity-60',
                        on && 'border-primary bg-primary-soft text-primary-soft-foreground'
                      )}
                    >
                      {d}d
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={p.email}
                    disabled={off}
                    onChange={e => set(t, { email: e.target.checked })}
                  />
                  Email
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={p.inApp}
                    disabled={off}
                    onChange={e => set(t, { inApp: e.target.checked })}
                  />
                  In-app
                </label>
              </div>
            </fieldset>
          );
        })}
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" disabled={!dirty} onClick={() => setPrefs(q.data!)}>
            Reset
          </Button>
          <Button
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(prefs, { onSuccess: () => toast.success('Notification preferences saved') })
            }
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            Save preferences
          </Button>
        </div>
      )}
    </div>
  );
}
