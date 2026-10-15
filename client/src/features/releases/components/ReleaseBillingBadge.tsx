import type { ReleaseView } from '@dsol/shared';
import { Link } from 'react-router';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';

/**
 * How a release's items stand in Billable work (prototype "Billing" column):
 * "Add to billing" until anything is added, then "n to bill", "Invoiced", "Paid" or "Not billable",
 * plus "· m not added" while some items are still missing.
 */
export function ReleaseBillingBadge({ r, onAdd }: { r: ReleaseView; onAdd?: () => void }) {
  const b = r.billing;
  if (!b.items) return <span className="text-muted-foreground">—</span>;
  if (!b.added)
    return onAdd ? (
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onAdd}>
        Add to billing
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">Not added</span>
    );
  const label = b.open ? `${b.open} to bill` : b.unpaid ? 'Invoiced' : b.paid ? 'Paid' : 'Not billable';
  const tone = b.open ? 'primary' : b.unpaid ? 'info' : b.paid ? 'ok' : 'muted';
  const missing = b.items - b.added;
  return (
    <Link to={`/work?release=${r.id}&status=all`} className="rounded-full focus-visible:outline-2">
      <StatusBadge status={label + (missing ? ` · ${missing} not added` : '')} tone={tone} dot={false} />
    </Link>
  );
}
