import {
  isoDate,
  RELEASE_STATUSES,
  todayIso,
  version,
  type ReleaseStatus,
  type ReleaseView
} from '@dsol/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { useProjectsList } from '@/features/projects/hooks/useProjects';
import { applyServerErrors, onInvalid } from '@/lib/forms';
import { useMe } from '@/lib/auth';
import { useTeam } from '@/lib/lookups';
import { useSaveRelease } from '../hooks/useReleases';

const lines = (s: string) =>
  s
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean);

const schema = z
  .object({
    clientId: z.string().min(1, 'Select a client.'),
    projectId: z.string().min(1, 'Select a project.'),
    version,
    environment: z.string().min(1, 'Select an environment.'),
    releaseDate: isoDate,
    status: z.enum(RELEASE_STATUSES),
    releasedBy: z.string(),
    features: z.string(),
    fixes: z.string(),
    issues: z.string(),
    bill: z.boolean()
  })
  .refine(v => lines(v.features).length + lines(v.fixes).length > 0, {
    path: ['features'],
    message: 'Add at least one feature or bug fix.'
  });

type Values = {
  clientId: string;
  projectId: string;
  version: string;
  environment: string;
  releaseDate: string;
  status: ReleaseStatus;
  releasedBy: string;
  features: string;
  fixes: string;
  issues: string;
  bill: boolean;
};

/** Add or edit a release. With "Add … to Billable work" ticked, saving opens the pricing dialog. */
export function ReleaseDrawer({
  open,
  onOpenChange,
  release,
  defaults,
  onSaved
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release?: ReleaseView | null;
  defaults?: { clientId?: string; projectId?: string };
  onSaved: (r: ReleaseView, bill: boolean) => void;
}) {
  const me = useMe();
  const team = useTeam();
  const clients = useClientOptions();
  const save = useSaveRelease(release?.id);
  const form = useForm<Values>({ resolver: zodResolver(schema) as unknown as Resolver<Values> });
  const { register, handleSubmit, formState, reset, watch, setValue, setError } = form;
  const e = formState.errors;
  const clientId = watch('clientId');
  const projects = useProjectsList(
    { client: clientId || undefined, pageSize: 100, sort: 'name:asc' },
    !!clientId
  );

  useEffect(() => {
    if (!open) return;
    reset(
      release
        ? {
            clientId: release.clientId,
            projectId: release.projectId,
            version: release.version,
            environment: 'PROD',
            releaseDate: release.releaseDate,
            status: 'Deployed',
            releasedBy: release.releasedBy ?? '',
            features: release.features.join('\n'),
            fixes: release.fixes.join('\n'),
            issues: release.issues.join('\n'),
            bill: false
          }
        : {
            clientId: defaults?.clientId ?? '',
            projectId: defaults?.projectId ?? '',
            version: '',
            environment: 'PROD',
            releaseDate: todayIso(),
            status: 'Deployed',
            releasedBy: me.data?.user?.id ?? '',
            features: '',
            fixes: '',
            issues: '',
            bill: true
          }
    );
  }, [open, release, defaults?.clientId, defaults?.projectId, me.data, reset]);

  const submit = handleSubmit(async v => {
    try {
      const saved = await save.mutateAsync({
        projectId: v.projectId,
        version: v.version,
        // releases are logged once they are live in production
        environment: 'PROD',
        releaseDate: v.releaseDate,
        status: 'Deployed',
        releasedBy: v.releasedBy || null,
        features: lines(v.features),
        fixes: lines(v.fixes),
        issues: lines(v.issues)
      });
      toast.success(release ? `${saved.version} updated` : `Release ${saved.version} created`);
      onOpenChange(false);
      onSaved(saved, v.bill);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  }, onInvalid);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[540px]">
        <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b p-5 text-left">
            <SheetTitle>{release ? `Edit release ${release.version}` : 'Add release'}</SheetTitle>
            <SheetDescription>
              Log a release once it’s live in production. One item per line in features, fixes and known
              issues.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client" required error={e.clientId?.message}>
                <NativeSelect
                  {...register('clientId', { onChange: () => setValue('projectId', '') })}
                  disabled={!!release}
                >
                  <option value="">Select</option>
                  {(clients.data ?? []).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {release && !clients.data?.some(c => c.id === release.clientId) && (
                    <option value={release.clientId}>{release.clientName}</option>
                  )}
                </NativeSelect>
              </Field>
              <Field label="Project" required error={e.projectId?.message}>
                <NativeSelect
                  value={watch('projectId') ?? ''}
                  {...register('projectId')}
                  disabled={!!release || !clientId}
                >
                  <option value="">{clientId ? 'Select' : 'Select a client first'}</option>
                  {(projects.data?.items ?? []).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  {release && <option value={release.projectId}>{release.projectName}</option>}
                </NativeSelect>
              </Field>
              <Field
                label="Release version"
                required
                hint="Semantic version, e.g. v2.4.1"
                error={e.version?.message}
              >
                <Input className="font-mono" placeholder="v1.2.0" {...register('version')} />
              </Field>
              <Field label="Release date" required error={e.releaseDate?.message}>
                <Input type="date" {...register('releaseDate')} />
              </Field>
              <Field label="Released by" error={e.releasedBy?.message}>
                <NativeSelect {...register('releasedBy')}>
                  <option value="">—</option>
                  {(team.data ?? []).map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Field label="Features" error={e.features?.message}>
              <Textarea rows={4} placeholder="One per line" {...register('features')} />
            </Field>
            <Field label="Bug fixes" error={e.fixes?.message}>
              <Textarea rows={3} placeholder="One per line" {...register('fixes')} />
            </Field>
            <Field label="Known issues" error={e.issues?.message}>
              <Textarea rows={2} placeholder="One per line" {...register('issues')} />
            </Field>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
                {...register('bill')}
              />
              Add features and fixes to Billable work after saving (set prices next)
            </label>
          </div>
          <SheetFooter className="border-t bg-surface-2 p-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              {release ? 'Save changes' : 'Add release'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
