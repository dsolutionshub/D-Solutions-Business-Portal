import { formatDate, formatInr, type WorkView } from '@dsol/shared';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useWork } from '@/features/work/hooks/useWork';

/** Pick this client's "To bill" work to add as invoice lines (prototype "Add delivered work"). */
export function AddWorkDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  projectId,
  exclude,
  onAdd
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  projectId: string;
  exclude: string[];
  onAdd: (work: WorkView[]) => void;
}) {
  const ready = useWork({ client: clientId, status: 'To bill', pageSize: 100 }, open && !!clientId);
  const needsPrice = useWork({ client: clientId, status: 'Needs price', pageSize: 1 }, open && !!clientId);
  const list = (ready.data?.items ?? []).filter(w => !exclude.includes(w.id));
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && ready.data)
      setPicked(new Set(list.filter(w => !projectId || w.projectId === projectId).map(w => w.id)));
  }, [open, ready.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const later = needsPrice.data?.total ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add delivered work</DialogTitle>
          <DialogDescription>{clientName} · fixes and features not yet invoiced</DialogDescription>
        </DialogHeader>
        {!ready.data ? (
          <Skeleton className="h-32" />
        ) : list.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-8 py-2" />
                  <th className="py-2">Work</th>
                  <th className="py-2">Project</th>
                  <th className="py-2">Delivered</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map(w => (
                  <tr key={w.id} className="border-t">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={picked.has(w.id)}
                        onChange={e =>
                          setPicked(p =>
                            e.target.checked ? new Set([...p, w.id]) : new Set([...p].filter(x => x !== w.id))
                          )
                        }
                        aria-label={`Add ${w.title}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-semibold">{w.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {w.type}
                        {w.releaseVersion && ` · ${w.releaseVersion}`}
                        {w.billing === 'Hourly' && ` · ${w.hours} h × ${formatInr(w.ratePaise)}`}
                      </div>
                    </td>
                    <td className="py-2">{w.projectName}</td>
                    <td className="py-2 text-muted-foreground">{formatDate(w.deliveredOn)}</td>
                    <td className="py-2 text-right font-semibold">{formatInr(w.billablePaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Nothing ready to invoice for this client"
            description="Log delivered work or add a release to billing first."
          />
        )}
        {later > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn">
            <AlertTriangle className="size-4" />
            {later} delivered item(s) still need a price.
            <Button asChild size="sm" variant="outline">
              <Link to={`/work?client=${clientId}&status=Needs price`}>Open Billable work</Link>
            </Button>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!!list.length && (
            <Button
              disabled={!picked.size}
              onClick={() => (onAdd(list.filter(w => picked.has(w.id))), onOpenChange(false))}
            >
              Add to invoice
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
