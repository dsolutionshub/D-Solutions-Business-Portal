import { ALERT_TYPES, formatDate, type Alert, type AlertType } from '@dsol/shared';
import {
  Calendar,
  Check,
  CreditCard,
  FileText,
  Globe,
  Lock,
  Megaphone,
  RefreshCw,
  Server,
  X,
  type LucideIcon
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAlertActions, useAlerts } from '../api';

const ALERT_ICON: Record<AlertType, LucideIcon> = {
  'Domain expiration': Globe,
  'SSL expiration': Lock,
  'Hosting renewals': Server,
  'Subscription renewals': RefreshCw,
  'Invoice due dates': FileText,
  'Overdue payments': CreditCard,
  'Upcoming maintenance': Calendar,
  'Other notices': Megaphone
};

const toneTile: Record<Alert['tone'], string> = {
  bad: 'bg-bad-bg text-bad',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info'
};

const STATES = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['read', 'Read']
] as const;

/** Notifications → Inbox: type filter, All/Unread/Read, mark read/unread, dismiss, show dismissed. */
export function AlertList() {
  const navigate = useNavigate();
  const [type, setType] = useState<AlertType | ''>('');
  const [state, setState] = useState<'all' | 'unread' | 'read'>('all');
  const [showDismissed, setShowDismissed] = useState(false);
  const q = useAlerts({ type: type || undefined, state, dismissed: showDismissed ? '1' : '0' });
  const { set, readAll, restore } = useAlertActions();
  const d = q.data;

  const open = (a: Alert) => {
    if (!a.read) set.mutate({ id: a.id, action: 'read' });
    navigate(a.href);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <NativeSelect
          value={type}
          onChange={e => setType(e.target.value as AlertType | '')}
          aria-label="Type"
          className="w-[200px]"
        >
          <option value="">All types</option>
          {ALERT_TYPES.filter(t => d?.byType[t] || t === type).map(t => (
            <option key={t} value={t}>
              {t} · {d?.byType[t] ?? 0}
            </option>
          ))}
        </NativeSelect>
        <div
          role="radiogroup"
          aria-label="Read state"
          className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]"
        >
          {STATES.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={state === v}
              onClick={() => setState(v)}
              className={cn(
                'h-7 rounded-md px-3 text-xs font-medium text-subtle-foreground',
                state === v && 'bg-card text-foreground shadow-sm'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {!!d?.dismissedCount && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                showDismissed
                  ? restore.mutate(undefined, {
                      onSuccess: r => (
                        setShowDismissed(false),
                        toast.success(`${r.restored} notification(s) restored`)
                      )
                    })
                  : setShowDismissed(true)
              }
            >
              {showDismissed ? 'Restore all dismissed' : `Show ${d.dismissedCount} dismissed`}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!d?.unread || readAll.isPending}
            onClick={() =>
              readAll.mutate(undefined, {
                onSuccess: () => toast.success('All notifications marked as read')
              })
            }
          >
            <Check /> Mark all as read
          </Button>
        </div>
      </div>

      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !d ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : d.items.length ? (
        <ul className="divide-y">
          {d.items.map(a => {
            const Icon = ALERT_ICON[a.type];
            return (
              <li
                key={a.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap',
                  !a.read && !a.dismissed && 'bg-primary-soft/40',
                  a.dismissed && 'opacity-60'
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    toneTile[a.tone]
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn('flex flex-wrap items-center gap-2 text-sm', !a.read && 'font-semibold')}
                  >
                    {a.title}
                    {!a.read && !a.dismissed && (
                      <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                        New
                      </span>
                    )}
                    {a.dismissed && (
                      <span className="text-xs font-normal text-muted-foreground">Dismissed</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.type} · {a.body}
                    {!a.body.includes(formatDate(a.dueDate)) && ` · ${formatDate(a.dueDate)}`}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => open(a)}>
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => set.mutate({ id: a.id, action: a.read ? 'unread' : 'read' })}
                  >
                    {a.read ? 'Mark unread' : 'Mark read'}
                  </Button>
                  {!a.dismissed && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Dismiss ${a.title}`}
                      onClick={() =>
                        set.mutate(
                          { id: a.id, action: 'dismiss' },
                          { onSuccess: () => toast.info('Notification dismissed') }
                        )
                      }
                    >
                      <X />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="You’re all caught up" description="Nothing is due inside your reminder windows." />
      )}
    </div>
  );
}
