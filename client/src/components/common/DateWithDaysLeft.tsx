import { daysUntil, type IsoDate } from '@dsol/shared';
import { formatDate, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A date with "in N days" — red within 7 days (or past), amber within 30. */
export function DateWithDaysLeft({ iso, inline }: { iso: IsoDate | null | undefined; inline?: boolean }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  const d = daysUntil(iso);
  const tone = d <= 7 ? 'text-bad' : d <= 30 ? 'text-warn' : 'text-muted-foreground';
  const rel = d < 0 ? `expired ${relativeDays(iso)}` : relativeDays(iso);
  return inline ? (
    <span>
      {formatDate(iso)} <span className={cn('text-xs', tone)}>· {rel}</span>
    </span>
  ) : (
    <div>
      <div>{formatDate(iso)}</div>
      <div className={cn('text-xs', tone)}>{rel}</div>
    </div>
  );
}
