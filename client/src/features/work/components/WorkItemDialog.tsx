import {
  formatInr,
  isoDate,
  rupeesToPaise,
  todayIso,
  WORK_TYPES,
  type BillingMode,
  type WorkType,
  type WorkView
} from '@dsol/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field, FieldGroup } from '@/components/common/Field';
import { Segmented } from '@/components/common/FilterBar';
import { MoneyInput } from '@/components/common/MoneyInput';
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
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { useProjectsList } from '@/features/projects/hooks/useProjects';
import { useReleases } from '@/features/releases/hooks/useReleases';
import { applyServerErrors, onInvalid } from '@/lib/forms';
import { useSettings } from '@/lib/lookups';
import { useSaveWork } from '../hooks/useWork';

type Values = {
  clientId: string;
  projectId: string;
  releaseId: string;
  type: WorkType;
  title: string;
  deliveredOn: string;
  billing: BillingMode;
  amount: string;
  hours: string;
  rate: string;
  note: string;
};

const schema = z
  .object({
    clientId: z.string().min(1, 'Select a client.'),
    projectId: z.string().min(1, 'Select a project.'),
    releaseId: z.string(),
    type: z.enum(WORK_TYPES),
    title: z.string().trim().min(3, 'Describe what was delivered.').max(200),
    deliveredOn: isoDate,
    billing: z.enum(['Fixed', 'Hourly', 'Free']),
    amount: z.string(),
    hours: z.string(),
    rate: z.string(),
    note: z.string().max(300)
  })
  .superRefine((v, ctx) => {
    if (v.billing === 'Fixed' && v.amount && !(Number(v.amount) >= 0))
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Enter an amount in ₹.' });
    if (v.billing === 'Hourly') {
      if (!(Number(v.hours) > 0))
        ctx.addIssue({ code: 'custom', path: ['hours'], message: 'Enter the hours.' });
      if (!(Number(v.rate) > 0)) ctx.addIssue({ code: 'custom', path: ['rate'], message: 'Enter the rate.' });
    }
  });

/** Log delivered work, or edit / price it. Client → project → release cascade. */
export function WorkItemDialog({
  open,
  onOpenChange,
  work,
  defaults
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  work?: WorkView | null;
  defaults?: { clientId?: string; projectId?: string };
}) {
  const settings = useSettings();
  const clients = useClientOptions();
  const save = useSaveWork(work?.id);
  const form = useForm<Values>({ resolver: zodResolver(schema) as unknown as Resolver<Values> });
  const { register, handleSubmit, formState, reset, watch, setValue, setError } = form;
  const e = formState.errors;
  const [clientId, projectId, billing] = watch(['clientId', 'projectId', 'billing']);
  const projects = useProjectsList(
    { client: clientId || undefined, pageSize: 100, sort: 'name:asc' },
    !!clientId
  );
  const releases = useReleases({ project: projectId || undefined, pageSize: 100 });
  const rateRupees = String((settings.data?.hourlyRatePaise ?? 0) / 100);

  useEffect(() => {
    if (!open) return;
    reset(
      work
        ? {
            clientId: work.clientId,
            projectId: work.projectId,
            releaseId: work.releaseId ?? '',
            type: work.type,
            title: work.title,
            deliveredOn: work.deliveredOn,
            billing: work.billing,
            amount: work.amountPaise ? String(work.amountPaise / 100) : '',
            hours: work.hours ? String(work.hours) : '',
            rate: work.ratePaise ? String(work.ratePaise / 100) : rateRupees,
            note: work.note ?? ''
          }
        : {
            clientId: defaults?.clientId ?? '',
            projectId: defaults?.projectId ?? '',
            releaseId: '',
            type: 'Feature',
            title: '',
            deliveredOn: todayIso(),
            billing: 'Fixed',
            amount: '',
            hours: '',
            rate: rateRupees,
            note: ''
          }
    );
  }, [open, work, defaults?.clientId, defaults?.projectId, rateRupees, reset]);

  const submit = handleSubmit(async v => {
    const body = {
      releaseId: v.releaseId || null,
      type: v.type,
      title: v.title.trim(),
      deliveredOn: v.deliveredOn,
      billing: v.billing,
      amountPaise: v.billing === 'Fixed' ? (rupeesToPaise(v.amount) ?? 0) : 0,
      hours: v.billing === 'Hourly' ? Number(v.hours) : 0,
      ratePaise: v.billing === 'Hourly' ? (rupeesToPaise(v.rate) ?? 0) : 0,
      note: v.note.trim() || null
    };
    try {
      const saved = await save.mutateAsync(work ? body : { ...body, projectId: v.projectId });
      toast.success(work ? 'Work updated' : `${saved.title} added — ${saved.status.toLowerCase()}`);
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(err, setError, p => ({ amountPaise: 'amount', ratePaise: 'rate' })[p] ?? p);
    }
  }, onInvalid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{work ? 'Edit delivered work' : 'Log delivered work'}</DialogTitle>
            <DialogDescription>A fix, feature or task you delivered and may bill for.</DialogDescription>
          </DialogHeader>
          {work?.invoiceNo && (
            <div className="flex gap-2 rounded-lg bg-info-bg px-3 py-2.5 text-sm text-info">
              <Info className="mt-0.5 size-4 flex-none" />
              Already on {work.invoiceNo}. Changing the price here does not change that invoice.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" required error={e.clientId?.message}>
              <NativeSelect
                {...register('clientId', {
                  onChange: () => (setValue('projectId', ''), setValue('releaseId', ''))
                })}
                disabled={!!work}
              >
                <option value="">Select</option>
                {(clients.data ?? []).map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {work && <option value={work.clientId}>{work.clientName}</option>}
              </NativeSelect>
            </Field>
            <Field label="Project" required error={e.projectId?.message}>
              <NativeSelect
                {...register('projectId', { onChange: () => setValue('releaseId', '') })}
                disabled={!!work || !clientId}
              >
                <option value="">{clientId ? 'Select' : 'Select a client first'}</option>
                {(projects.data?.items ?? []).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                {work && <option value={work.projectId}>{work.projectName}</option>}
              </NativeSelect>
            </Field>
            <Field label="Type">
              <NativeSelect {...register('type')}>
                {WORK_TYPES.map(t => (
                  <option key={t}>{t}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Delivered on" required error={e.deliveredOn?.message}>
              <Input type="date" {...register('deliveredOn')} />
            </Field>
          </div>
          <Field label="What was delivered" required error={e.title?.message}>
            <Input placeholder="e.g. Fix COD duplicate order on retry" {...register('title')} />
          </Field>
          <Field label="Release (optional)">
            <NativeSelect {...register('releaseId')} disabled={!projectId}>
              <option value="">Not part of a release</option>
              {(projectId ? (releases.data?.items ?? []) : []).map(r => (
                <option key={r.id} value={r.id}>
                  {r.version} · {r.environment}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <FieldGroup label="Pricing">
            <Segmented
              label="Pricing"
              value={billing}
              onChange={v => setValue('billing', v, { shouldDirty: true })}
              options={[
                ['Fixed', 'Fixed price'],
                ['Hourly', 'Hourly'],
                ['Free', 'Not billable']
              ]}
            />
          </FieldGroup>
          {billing === 'Fixed' && (
            <Field label="Amount (₹)" hint="Leave empty if it isn't priced yet." error={e.amount?.message}>
              <MoneyInput step="0.01" placeholder="0" {...register('amount')} />
            </Field>
          )}
          {billing === 'Hourly' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hours" required error={e.hours?.message}>
                <Input type="number" min={0} step={0.5} {...register('hours')} />
              </Field>
              <Field
                label="Rate per hour (₹)"
                required
                hint={`Default ${formatInr(settings.data?.hourlyRatePaise ?? 0)}`}
                error={e.rate?.message}
              >
                <MoneyInput step="1" {...register('rate')} />
              </Field>
            </div>
          )}
          <Field label="Note (optional)" error={e.note?.message}>
            <Input
              placeholder={billing === 'Free' ? 'Why it is free, e.g. warranty' : 'Internal note'}
              {...register('note')}
            />
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              {work ? 'Save' : 'Add work'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
