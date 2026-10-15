import { PROJECT_STATUSES, SHEET_SECTIONS } from '@dsol/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm, type Resolver } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EnvBadge } from '@/components/common/EnvBadge';
import { ErrorState } from '@/components/common/ErrorState';
import { Field, FieldGroup } from '@/components/common/Field';
import { FormAccordionSection } from '@/components/common/FormAccordion';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { UnsavedChangesGuard } from '@/components/common/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { applyServerErrors, onInvalid } from '@/lib/forms';
import { listOptions, useLists } from '@/lib/useLists';
import {
  apiPathToForm,
  emptyProjectForm,
  formToSave,
  viewToForm,
  type ProjectFormValues
} from '../formMapping';
import { useCreateProject, useProject, useUpdateProject } from '../hooks/useProjects';
import { CostsEditor, ExtraKeysEditor } from '../components/RowEditors';
import { SheetFieldInput } from '../components/SheetFieldInput';
import { projectFormSchema } from '../schema';

/** Add (/projects/new?client=…) and edit (/projects/:projectId/edit): every detail of the store on one page. */
export function ProjectFormPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const existing = useProject(projectId);
  if (projectId && existing.isLoading)
    return (
      <Card className="space-y-4 p-6" aria-busy>
        <Skeleton className="h-7 w-48" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </Card>
    );
  if (projectId && (existing.error || !existing.data))
    return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  const initial = existing.data ? viewToForm(existing.data) : emptyProjectForm(params.get('client') ?? '');
  return (
    <ProjectForm
      key={projectId ?? 'new'}
      projectId={projectId}
      initial={initial}
      name={existing.data?.project.name}
      archived={!!existing.data?.project.archivedAt}
    />
  );
}

function ProjectForm({
  projectId,
  initial,
  name,
  archived
}: {
  projectId?: string;
  initial: ProjectFormValues;
  name?: string;
  archived: boolean;
}) {
  const navigate = useNavigate();
  const lists = useLists();
  const clients = useClientOptions();
  const create = useCreateProject();
  const update = useUpdateProject(projectId ?? '');
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema) as unknown as Resolver<ProjectFormValues>,
    defaultValues: initial,
    shouldFocusError: true
  });
  const { register, handleSubmit, formState, watch, setValue, setError, getValues, reset } = form;
  const e = formState.errors.project;
  const busy = formState.isSubmitting;

  useEffect(() => {
    if (leaveTo && !formState.isDirty) navigate(leaveTo);
  }, [leaveTo, formState.isDirty, navigate]);

  const envs = watch('project.environments');
  const envChoices = useMemo(
    () => listOptions(lists.data, 'environments', ...initial.project.environments),
    [lists.data, initial.project.environments]
  );
  const clientChoices = useMemo(() => {
    const list = clients.data ?? [];
    return list.some(c => c.id === initial.project.clientId) || !initial.project.clientId
      ? list
      : [...list, { id: initial.project.clientId, name: name ? 'Current client' : initial.project.clientId }];
  }, [clients.data, initial.project.clientId, name]);

  const save = handleSubmit(async () => {
    const { body, extraIndex, costIndex } = formToSave(getValues());
    try {
      const saved = projectId ? await update.mutateAsync(body) : await create.mutateAsync(body);
      toast.success(
        projectId
          ? `${saved.project.name} updated`
          : `Project “${saved.project.name}” created for ${saved.client.name}`
      );
      reset(viewToForm(saved));
      setLeaveTo(`/projects/${saved.project.id}`);
    } catch (err) {
      applyServerErrors(err, setError, p => apiPathToForm(p, extraIndex, costIndex));
    }
  }, onInvalid);

  const back = projectId ? `/projects/${projectId}` : '/projects';

  if (archived)
    return (
      <Card>
        <ErrorState
          error={new Error('This project is archived. Restore it before editing.')}
          title="Archived project"
        />
        <div className="flex justify-center pb-8">
          <Button asChild variant="outline">
            <Link to={back}>Back to project</Link>
          </Button>
        </div>
      </Card>
    );

  return (
    <FormProvider {...form}>
      <PageHeader
        back={{ to: back, label: projectId ? `Back to ${name}` : 'Back to projects' }}
        title={projectId ? 'Edit project' : 'New project'}
        description={
          <>
            {projectId
              ? `Update everything about ${name} in one place.`
              : 'Enter everything about the store in one place — URLs, domain, hosting, database and keys.'}{' '}
            Fields marked <span className="text-destructive">*</span> are required.
          </>
        }
      />
      <form noValidate onSubmit={save}>
        <Card>
          <FormAccordionSection
            step={1}
            title="Project basics"
            description="Which client this store belongs to and where it runs."
            required
            defaultOpen
            hasError={!!formState.errors.project}
          >
            <Field label="Project name" required error={e?.name?.message}>
              <Input placeholder="e.g. Kaveri Storefront" {...register('project.name')} />
            </Field>
            <Field label="Client" required error={e?.clientId?.message}>
              <NativeSelect {...register('project.clientId')}>
                <option value="">{clients.isLoading ? 'Loading clients…' : 'Select a client'}</option>
                {clientChoices.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Project type" error={e?.type?.message}>
              <NativeSelect {...register('project.type')}>
                <option value="">Select</option>
                {listOptions(lists.data, 'projectType', initial.project.type).map(o => (
                  <option key={o}>{o}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Status" error={e?.status?.message}>
              <NativeSelect {...register('project.status')}>
                {PROJECT_STATUSES.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Start date" error={e?.startDate?.message}>
              <Input type="date" {...register('project.startDate')} />
            </Field>
            <FieldGroup label="Environments" required wide error={e?.environments?.message}>
              <div className="flex flex-wrap gap-4">
                {envChoices.map(env => (
                  <label key={env} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[hsl(var(--primary))]"
                      checked={envs.includes(env)}
                      onChange={ev =>
                        setValue(
                          'project.environments',
                          ev.target.checked ? [...envs, env] : envs.filter(x => x !== env),
                          {
                            shouldDirty: true,
                            shouldValidate: formState.isSubmitted
                          }
                        )
                      }
                    />
                    <EnvBadge env={env} />
                  </label>
                ))}
              </div>
            </FieldGroup>
          </FormAccordionSection>

          {SHEET_SECTIONS.map((s, i) => (
            <FormAccordionSection
              key={s.key}
              step={i + 2}
              title={s.title}
              description={s.desc}
              required={s.fields.some(f => 'required' in f && f.required)}
              hasError={!!formState.errors.sheet?.[s.key]}
            >
              {s.fields.map(f => (
                <SheetFieldInput
                  key={f.key}
                  section={s.key}
                  field={f}
                  initial={initial.sheet[s.key]?.[f.key]}
                />
              ))}
            </FormAccordionSection>
          ))}

          <FormAccordionSection
            step={SHEET_SECTIONS.length + 2}
            title="Other keys"
            description="Anything else to keep: search, CDN, marketplace or app keys. Tick “Secret” to store it encrypted and masked."
            hasError={!!formState.errors.extraKeys}
          >
            <ExtraKeysEditor />
          </FormAccordionSection>

          <FormAccordionSection
            step={SHEET_SECTIONS.length + 3}
            title="Other recurring costs"
            description="Paid tools, extra domains and services for this store. Add the next due date to get renewal reminders."
            hasError={!!formState.errors.costs}
          >
            <CostsEditor />
          </FormAccordionSection>

          <FormAccordionSection
            step={SHEET_SECTIONS.length + 4}
            title="Notes"
            description="Deployment rules, contacts, anything the team should know."
            hasError={!!formState.errors.sheet?.notes}
          >
            <Field label="Notes" wide error={formState.errors.sheet?.notes?.message}>
              <Textarea rows={4} {...register('sheet.notes')} />
            </Field>
          </FormAccordionSection>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-surface-2/95 px-5 py-3.5 backdrop-blur">
            <span className={formState.isDirty ? 'text-xs text-warn' : 'text-xs text-muted-foreground'}>
              {formState.isDirty
                ? 'Unsaved changes'
                : 'Domain, SSL, hosting and cost dates feed renewal reminders automatically.'}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(back)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {projectId ? 'Save changes' : 'Save project'}
              </Button>
            </div>
          </div>
        </Card>
      </form>
      <UnsavedChangesGuard
        when={formState.isDirty && !busy}
        message="What you entered for this project will be lost."
      />
    </FormProvider>
  );
}
