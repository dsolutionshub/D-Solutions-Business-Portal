import { cn } from '@/lib/utils';

export type BadgeTone = 'ok' | 'warn' | 'bad' | 'info' | 'purple' | 'muted' | 'primary';

const toneClass: Record<BadgeTone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-info-bg text-info',
  purple: 'bg-purple-bg text-purple',
  muted: 'bg-muted text-subtle-foreground',
  primary: 'bg-primary-soft text-primary-soft-foreground'
};

/** Colour for every status word used in the portal (from the prototype's STATUS maps). */
const STATUS_TONE: Record<string, BadgeTone> = {
  // clients, users
  Active: 'ok',
  Inactive: 'muted',
  Invited: 'warn',
  Deactivated: 'muted',
  // projects
  Maintenance: 'info',
  Planning: 'purple',
  Completed: 'muted',
  Archived: 'muted',
  // releases
  Deployed: 'ok',
  'In QA': 'purple',
  Scheduled: 'info',
  Failed: 'bad',
  'Rolled back': 'warn',
  Draft: 'muted',
  // emails
  Delivered: 'ok',
  Sent: 'info',
  'Not sent': 'muted',
  'Logged (dev)': 'purple',
  // invoices
  'Partially paid': 'warn',
  Paid: 'ok',
  Overdue: 'bad',
  Void: 'muted',
  // work
  'Needs price': 'warn',
  'To bill': 'primary',
  'In draft': 'muted',
  Invoiced: 'info',
  'Part paid': 'purple',
  'Not billable': 'muted',
  // due dates
  'Expiring soon': 'warn',
  Expired: 'bad'
};

export function StatusBadge({
  status,
  tone,
  dot = true,
  className,
  title
}: {
  status: string;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  /** tooltip, e.g. why an email failed */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none',
        toneClass[tone ?? STATUS_TONE[status] ?? 'muted'],
        className
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {status}
    </span>
  );
}
