import { formatInr, rupeesToPaise, type BillingMode, type ReleaseView } from '@dsol/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/lib/lookups';
import { useWork } from '@/features/work/hooks/useWork';
import { useReleaseActions } from '../hooks/useReleases';

interface Row {
  title: string;
  kind: 'Feature' | 'Bug fix';
  include: boolean;
  billing: BillingMode;
  value: string;
}

/**
 * Price a release's features and fixes in one go (prototype "Add to billing"). Items already in
 * Billable work are left out. Amount is in ₹ for fixed price, hours for hourly; empty = price later.
 */
export function AddToBillingDialog({
  release,
  onOpenChange
}: {
  release: ReleaseView | null;
  onOpenChange: (open: boolean) => void;
}) {
  const work = useWork({ release: release?.id, status: 'all', pageSize: 100 }, !!release);
  const settings = useSettings();
  const { bill } = useReleaseActions();
  const [rows, setRows] = useState<Row[]>([]);

  const pending = useMemo(() => {
    if (!release || !work.data) return null;
    const have = new Set(work.data.items.map(w => w.title));
    return [
      ...release.features.map(t => ({ title: t, kind: 'Feature' as const })),
      ...release.fixes.map(t => ({ title: t, kind: 'Bug fix' as const }))
    ].filter(x => !have.has(x.title));
  }, [release, work.data]);

  useEffect(() => {
    if (pending) setRows(pending.map(p => ({ ...p, include: true, billing: 'Fixed', value: '' })));
  }, [pending]);

  const set = (i: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const rate = settings.data?.hourlyRatePaise ?? 0;

  const submit = () => {
    if (!release) return;
    const items = rows
      .filter(r => r.include)
      .map(r => ({
        title: r.title,
        kind: r.kind,
        billing: r.billing,
        value:
          r.billing === 'Fixed'
            ? rupeesToPaise(r.value)
            : r.billing === 'Hourly'
              ? Number(r.value) || 0
              : null
      }));
    if (!items.length) return toast.error('Tick at least one item.');
    bill.mutate(
      { id: release.id, body: { items } },
      {
        onSuccess: res => {
          toast.success(res.added ? `${res.added} item(s) added to Billable work` : 'Nothing new to add');
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={!!release} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Add to billing · {release?.projectName} {release?.version}
          </DialogTitle>
          <DialogDescription>
            Set a price for each delivered item. Leave the amount empty to price it later.
          </DialogDescription>
        </DialogHeader>
        {!pending ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : !rows.length ? (
          <EmptyState title="Everything in this release is already in Billable work" />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-8 py-2" />
                  <th className="py-2">Item</th>
                  <th className="w-44 py-2">Pricing</th>
                  <th className="w-40 py-2">Amount / hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.title} className="border-t">
                    <td className="py-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[hsl(var(--primary))]"
                        checked={r.include}
                        onChange={e => set(i, { include: e.target.checked })}
                        aria-label={`Include ${r.title}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{r.kind}</div>
                    </td>
                    <td className="py-2 pr-2">
                      <NativeSelect
                        value={r.billing}
                        onChange={e => set(i, { billing: e.target.value as BillingMode })}
                        aria-label={`Pricing for ${r.title}`}
                      >
                        <option value="Fixed">Fixed price</option>
                        <option value="Hourly">Hourly ({formatInr(rate)}/h)</option>
                        <option value="Free">Not billable</option>
                      </NativeSelect>
                    </td>
                    <td className="py-2">
                      <Input
                        type="number"
                        min={0}
                        step={r.billing === 'Hourly' ? 0.5 : 1}
                        disabled={r.billing === 'Free'}
                        value={r.value}
                        onChange={e => set(i, { value: e.target.value })}
                        placeholder={r.billing === 'Hourly' ? 'hours' : '₹'}
                        aria-label={`${r.billing === 'Hourly' ? 'Hours' : 'Amount'} for ${r.title}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {rows.length ? 'Skip for now' : 'Close'}
          </Button>
          {!!rows.length && (
            <Button onClick={submit} disabled={bill.isPending}>
              {bill.isPending && <Loader2 className="animate-spin" />}
              Add to billing
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
