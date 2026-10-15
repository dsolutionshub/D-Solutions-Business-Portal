import { formatDate } from '@dsol/shared';
import { Bell } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAlertActions, useAlerts } from '../api';

const dot = { bad: 'bg-bad', warn: 'bg-warn', info: 'bg-info' } as const;

/** Topbar bell: unread count and the five most urgent alerts. */
export function BellMenu() {
  const navigate = useNavigate();
  const q = useAlerts({ limit: 5 });
  const { set, readAll } = useAlertActions();
  const unread = q.data?.unread ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications, ${unread} unread`}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-4 text-white dark:text-slate-950">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm">Notifications</DropdownMenuLabel>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={!unread}
            onClick={() => readAll.mutate()}
          >
            Mark all as read
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        {q.data?.items.length ? (
          q.data.items.map(a => (
            <DropdownMenuItem
              key={a.id}
              className="flex items-start gap-2.5 rounded-none px-3 py-2.5"
              onSelect={() => {
                if (!a.read) set.mutate({ id: a.id, action: 'read' });
                navigate(a.href);
              }}
            >
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  a.read ? 'bg-muted-foreground/40' : dot[a.tone]
                )}
                aria-hidden
              />
              <span className="min-w-0">
                <span className={cn('block text-[13px]', !a.read && 'font-medium')}>{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.body}
                  {!a.body.includes(formatDate(a.dueDate)) && ` · ${formatDate(a.dueDate)}`}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {q.isLoading ? 'Loading…' : q.error ? 'Couldn’t load notifications.' : 'You’re all caught up'}
          </div>
        )}
        <DropdownMenuSeparator className="m-0" />
        <DropdownMenuItem
          asChild
          className="justify-center rounded-none py-2.5 text-[13px] font-medium text-primary-soft-foreground"
        >
          <Link to="/notifications">View all notifications</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
