import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'ok' | 'warn' | 'bad' | 'primary';

const toneClass: Record<StatTone, string> = {
  default: '',
  ok: 'text-ok',
  warn: 'text-warn',
  bad: 'text-bad',
  primary: 'text-primary-soft-foreground'
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  to,
  loading
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  to?: string;
  loading?: boolean;
}) {
  const body = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <span className={cn('text-[22px] font-semibold tabular-nums tracking-tight', toneClass[tone])}>
          {value}
        </span>
      )}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  const cls = 'flex flex-col gap-1.5 rounded-xl border bg-card px-[18px] py-4 shadow-sm';
  return to ? (
    <Link to={to} className={cn(cls, 'transition-shadow hover:border-border-strong hover:shadow-md')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">{children}</div>;
}
