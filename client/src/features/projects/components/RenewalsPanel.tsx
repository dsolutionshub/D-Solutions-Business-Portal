import {
  addMonths,
  BILLING_CYCLES,
  formatDate,
  formatInr,
  rupeesToPaise,
  todayIso,
  type BillingCycle,
  type RenewalItem
} from '@dsol/shared';
import { Globe, Loader2, Lock, Plus, RefreshCw, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DateWithDaysLeft } from '@/components/common/DateWithDaysLeft';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Field } from '@/components/common/Field';
import { MoneyInput } from '@/components/common/MoneyInput';
import { NativeSelect } from '@/components/common/NativeSelect';
import { StatusBadge } from '@/components/common/StatusBadge';
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
import { Switch } from '@/components/ui/switch';
import { useCan } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useProjectRenewals, useRenewalActions } from '../renewalsApi';

const KIND_ICON = { Domain: Globe, SSL: Lock, Hosting: Server, Subscription: RefreshCw } as const;
const PAID_VIA = ['Company card', 'Provider wallet / credit', 'Client paid directly'] as const;

/** Project → Details: everything with a due date, renew it, add recurring costs, renewal history. */
export function RenewalsPanel({
  projectId,
  clientName,
  archived
}: {
  projectId: string;
  clientName: string;
  archived: boolean;
}) {
  const q = useProjectRenewals(projectId);
  const actions = useRenewalActions(projectId);
  const canRenew = useCan('renewals.write') && !archived;
  const canEdit = useCan('projects.write') && !archived;
  const [renewing, setRenewing] = useState<RenewalItem | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section className="min-w-0 rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">Renewals</h2>
          <p className="text-xs text-muted-foreground">
            Domain, SSL, hosting and subscriptions from this sheet. Renewing moves the date forward and logs
            it.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add recurring cost
          </Button>
        )}
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <>
          {q.data.items.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">What</th>
                    <th className="px-2 py-2 font-medium">Expiry / due</th>
                    <th className="px-2 py-2 text-right font-medium">Amount</th>
                    <th className="px-2 py-2 font-medium">Auto-renew</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map(r => {
                    const Icon = KIND_ICON[r.kind];
                    return (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <Icon className="size-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="font-semibold">{r.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.kind} · {r.cycle}
                                {r.provider && ` · ${r.provider}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <DateWithDaysLeft iso={r.expiry} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {r.amountPaise ? formatInr(r.amountPaise) : 'Free'}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.kind === 'Domain' ? (
                            <Switch
                              checked={!!r.autoRenew}
                              disabled={!canEdit || actions.autoRenew.isPending}
                              aria-label={`Auto-renew ${r.name}`}
                              onCheckedChange={on =>
                                actions.autoRenew.mutate(on, {
                                  onSuccess: () =>
                                    toast.success(`Auto-renew ${on ? 'on' : 'off'} for ${r.name}`)
                                })
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {canRenew && (
                            <Button size="sm" variant="outline" onClick={() => setRenewing(r)}>
                              Renew
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Nothing due here"
              description="Add domain, SSL, hosting and cost dates in the project sheet."
            />
          )}
          <div className="border-t px-4 py-3">
            <h3 className="mb-2 text-[13px] font-semibold">Renewal history</h3>
            {q.data.history.length ? (
              <ul className="divide-y text-[13px]">
                {q.data.history.map(h => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{h.itemName}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {formatDate(h.renewedOn)} · {h.period} · {h.renewedBy}
                        {h.paidVia && ` · ${h.paidVia}`}
                        {h.reference && ` · ${h.reference}`}
                      </span>
                    </span>
                    <span className="font-semibold">
                      {h.amountPaise ? formatInr(h.amountPaise) : '₹0 (auto)'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">No renewals logged yet.</p>
            )}
          </div>
        </>
      )}
      <RenewDialog
        item={renewing}
        clientName={clientName}
        onOpenChange={o => !o && setRenewing(null)}
        projectId={projectId}
      />
      <AddCostDialog open={adding} onOpenChange={setAdding} projectId={projectId} />
    </section>
  );
}

type RenewValues = { periods: string; paidVia: string; reference: string; amount: string };

function RenewDialog({
  item,
  clientName,
  onOpenChange,
  projectId
}: {
  item: RenewalItem | null;
  clientName: string;
  onOpenChange: (o: boolean) => void;
  projectId: string;
}) {
  const { renew } = useRenewalActions(projectId);
  const { register, handleSubmit, reset, watch, setValue, setError, formState } = useForm<RenewValues>();
  const e = formState.errors;
  const periods = Number(watch('periods') || 1);
  const monthly = item?.cycle === 'Monthly';
  const options = monthly ? [1, 3, 12] : [1, 2, 3];

  useEffect(() => {
    if (item)
      reset({ periods: '1', paidVia: PAID_VIA[0], reference: '', amount: String(item.amountPaise / 100) });
  }, [item, reset]);
  // amount follows the period unless typed over
  useEffect(() => {
    if (item && !formState.dirtyFields.amount) setValue('amount', String((item.amountPaise * periods) / 100));
  }, [periods]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = item ? addMonths(item.expiry, monthly ? periods : 12 * periods) : '';
  const submit = handleSubmit(async v => {
    if (!item) return;
    if (v.reference.trim().length < 4)
      return setError('reference', { message: 'Add the order or receipt number for audit.' });
    const amountPaise = rupeesToPaise(v.amount);
    if (amountPaise === null || amountPaise < 0)
      return setError('amount', { message: 'Enter the amount paid (0 if free).' });
    try {
      const r = await renew.mutateAsync({
        ref: item.ref,
        body: { periods, paidVia: v.paidVia || null, reference: v.reference.trim(), amountPaise }
      });
      toast.success(`${item.name} renewed — new date ${formatDate(r.item.expiry)}`);
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, setError, p => (p === 'amountPaise' ? 'amount' : p));
    }
  });

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Renew {item?.name}</DialogTitle>
            <DialogDescription>
              {item?.projectName} · {clientName} · due {formatDate(item?.expiry)}
            </DialogDescription>
          </DialogHeader>
          <Field label="Renewal period">
            <div role="radiogroup" className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]">
              {options.map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={periods === n}
                  onClick={() => setValue('periods', String(n))}
                  className={cn(
                    'h-8 rounded-md px-3 text-xs font-medium text-subtle-foreground',
                    periods === n && 'bg-card text-foreground shadow-sm'
                  )}
                >
                  {n} {monthly ? (n === 1 ? 'month' : 'months') : n === 1 ? 'year' : 'years'}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paid via">
              <NativeSelect {...register('paidVia')}>
                {PAID_VIA.map(p => (
                  <option key={p}>{p}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Amount paid (₹)" error={e.amount?.message}>
              <MoneyInput step="0.01" {...register('amount')} />
            </Field>
          </div>
          <Field label="Order / receipt no." required error={e.reference?.message}>
            <Input placeholder="e.g. GD-88213490" {...register('reference')} />
          </Field>
          <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
            New date in the project sheet: <b>{formatDate(next)}</b>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={renew.isPending}>
              {renew.isPending && <Loader2 className="animate-spin" />}
              Mark as renewed
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type CostValues = { name: string; amount: string; cycle: BillingCycle; nextDue: string };

function AddCostDialog({
  open,
  onOpenChange,
  projectId
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
}) {
  const { addCost } = useRenewalActions(projectId);
  const { register, handleSubmit, reset, setError, formState } = useForm<CostValues>();
  const e = formState.errors;
  useEffect(() => {
    if (open) reset({ name: '', amount: '', cycle: 'Monthly', nextDue: '' });
  }, [open, reset]);

  const submit = handleSubmit(async v => {
    const amountPaise = rupeesToPaise(v.amount);
    const problems: [keyof CostValues, string][] = [];
    if (!v.name.trim()) problems.push(['name', 'Name this cost.']);
    if (amountPaise === null || amountPaise < 0) problems.push(['amount', 'Enter an amount.']);
    if (!v.nextDue) problems.push(['nextDue', 'Pick the next due date.']);
    if (problems.length) return problems.forEach(([f, message]) => setError(f, { message }));
    try {
      await addCost.mutateAsync({
        name: v.name.trim(),
        amountPaise: amountPaise!,
        cycle: v.cycle,
        nextDue: v.nextDue
      });
      toast.success(`${v.name.trim()} added`);
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, setError, p => (p === 'amountPaise' ? 'amount' : p));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add recurring cost</DialogTitle>
            <DialogDescription>Saved in the project sheet under “Other recurring costs”.</DialogDescription>
          </DialogHeader>
          <Field label="What is it?" required error={e.name?.message}>
            <Input placeholder="e.g. Cloudflare Pro, extra domain, app store fee" {...register('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount (₹)" required error={e.amount?.message}>
              <MoneyInput step="0.01" {...register('amount')} />
            </Field>
            <Field label="Billing cycle">
              <NativeSelect {...register('cycle')}>
                {BILLING_CYCLES.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Next due date" required error={e.nextDue?.message}>
              <Input type="date" min={todayIso()} {...register('nextDue')} />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addCost.isPending}>
              {addCost.isPending && <Loader2 className="animate-spin" />}
              Add cost
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
