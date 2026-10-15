import { zodResolver } from '@hookform/resolvers/zod';
import { ImageUp, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ClientLogo } from '@/components/common/ClientLogo';
import { ErrorState } from '@/components/common/ErrorState';
import { Field, FieldGroup } from '@/components/common/Field';
import { Segmented } from '@/components/common/FilterBar';
import { FormAccordionSection } from '@/components/common/FormAccordion';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { UnsavedChangesGuard } from '@/components/common/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { applyServerErrors, onInvalid } from '@/lib/forms';
import { listOptions, useLists } from '@/lib/useLists';
import { useClient, useCreateClient, useLogo, useUpdateClient } from '../hooks/useClients';
import {
  apiPathToField,
  clientFormSchema,
  clientToForm,
  emptyClientForm,
  formToApi,
  type ClientFormOutput,
  type ClientFormValues
} from '../schema';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const LOGO_MAX = 1024 * 1024;

/** Add (/clients/new) and edit (/clients/:clientId/edit). */
export function ClientFormPage() {
  const { clientId } = useParams();
  const existing = useClient(clientId);
  if (clientId && existing.isLoading) return <FormSkeleton />;
  if (clientId && existing.error)
    return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  return (
    <ClientForm
      key={clientId ?? 'new'}
      clientId={clientId}
      initial={existing.data ? clientToForm(existing.data) : emptyClientForm()}
      existing={existing.data}
    />
  );
}

function ClientForm({
  clientId,
  initial,
  existing
}: {
  clientId?: string;
  initial: ClientFormValues;
  existing?: ReturnType<typeof useClient>['data'];
}) {
  const navigate = useNavigate();
  const lists = useLists();
  const create = useCreateClient();
  const update = useUpdateClient(clientId ?? '');
  const logo = useLogo(clientId);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);

  const form = useForm<ClientFormValues, unknown, ClientFormOutput>({
    resolver: zodResolver(clientFormSchema) as unknown as Resolver<
      ClientFormValues,
      unknown,
      ClientFormOutput
    >,
    defaultValues: initial
  });
  const { register, handleSubmit, formState, watch, setValue, reset, setError } = form;
  const e = formState.errors;
  const dirty = formState.isDirty || !!logoFile || removeLogo;

  // Navigate only after the form is clean, so the unsaved-changes guard doesn't fire.
  useEffect(() => {
    if (leaveTo && !dirty) navigate(leaveTo);
  }, [leaveTo, dirty, navigate]);

  const preview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : null), [logoFile]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return toast.error('Logos must be PNG, JPG, WebP or SVG.');
    if (file.size > LOGO_MAX) return toast.error('Logo must be smaller than 1 MB.');
    setLogoFile(file);
    setRemoveLogo(false);
  };

  const save = (mode: 'save' | 'another') =>
    handleSubmit(async values => {
      try {
        const body = formToApi(values);
        const saved = clientId ? await update.mutateAsync(body) : await create.mutateAsync(body);
        if (logoFile)
          await logo.upload
            .mutateAsync({ id: saved.id, file: logoFile })
            .catch(() => toast.error('Client saved, but the logo upload failed.'));
        else if (removeLogo && existing?.logoUrl) await logo.remove.mutateAsync(saved.id);
        toast.success(clientId ? `${saved.name} updated` : `${saved.name} added`);
        setLogoFile(null);
        setRemoveLogo(false);
        if (mode === 'another') {
          reset(emptyClientForm());
          if (clientId) setLeaveTo('/clients/new');
          window.scrollTo({ top: 0 });
        } else {
          reset(values as unknown as ClientFormValues);
          setLeaveTo(`/clients/${saved.id}`);
        }
      } catch (err) {
        applyServerErrors(err, setError, apiPathToField);
      }
    }, onInvalid)();

  const opts = (key: 'businessType' | 'industry' | 'state', current: string) =>
    listOptions(lists.data, key, current).map(o => <option key={o}>{o}</option>);

  const busy = formState.isSubmitting;
  const sectionHasError = (...names: (keyof typeof formState.errors)[]) =>
    names.some(n => !!formState.errors[n]);
  const name = watch('name');
  const status = watch('status');
  const back = clientId ? `/clients/${clientId}` : '/clients';

  if (existing?.archivedAt)
    return (
      <Card>
        <ErrorState
          error={new Error('This client is archived. Restore it before editing.')}
          title="Archived client"
        />
        <div className="flex justify-center pb-8">
          <Button asChild variant="outline">
            <Link to={back}>Back to client</Link>
          </Button>
        </div>
      </Card>
    );

  return (
    <>
      <PageHeader
        back={{ to: back, label: clientId ? `Back to ${existing?.name ?? 'client'}` : 'Back to clients' }}
        title={clientId ? 'Edit client' : 'Add client'}
        description={
          <>
            {clientId
              ? `Update details for ${existing?.name}.`
              : 'Create a client record for a new e-commerce account.'}{' '}
            Fields marked <span className="text-destructive">*</span> are required.
          </>
        }
      />
      <form
        noValidate
        onSubmit={ev => {
          ev.preventDefault();
          void save('save');
        }}
      >
        <Card>
          <FormAccordionSection
            step={1}
            title="Business information"
            description="How the client appears across projects, invoices and emails."
            required
            defaultOpen
            hasError={sectionHasError('name', 'gstin', 'type', 'industry', 'since', 'description')}
          >
            <Field label="Client name" required error={e.name?.message}>
              <Input placeholder="e.g. Kaveri Naturals" autoComplete="organization" {...register('name')} />
            </Field>
            <Field label="GST number" error={e.gstin?.message}>
              <Input
                placeholder="e.g. 29AAKCK1234F1Z5"
                maxLength={15}
                className="font-mono uppercase placeholder:normal-case"
                autoComplete="off"
                {...register('gstin')}
              />
            </Field>
            <Field label="Business type" error={e.type?.message}>
              <NativeSelect {...register('type')}>
                <option value="">Select</option>
                {opts('businessType', initial.type)}
              </NativeSelect>
            </Field>
            <Field label="Industry" error={e.industry?.message}>
              <NativeSelect {...register('industry')}>
                <option value="">Select</option>
                {opts('industry', initial.industry)}
              </NativeSelect>
            </Field>
            <Field label="Client since" error={e.since?.message}>
              <Input type="date" {...register('since')} />
            </Field>
            <Field label="Description" wide hint="Up to 500 characters" error={e.description?.message}>
              <Textarea
                maxLength={500}
                placeholder="What the client sells, key channels, anything the team should know."
                {...register('description')}
              />
            </Field>
          </FormAccordionSection>

          <FormAccordionSection
            step={2}
            title="Contact information"
            description="Primary point of contact for approvals, releases and billing."
            required
            hasError={sectionHasError('contact', 'email', 'phone', 'altPhone')}
          >
            <Field label="Primary contact" required error={e.contact?.message}>
              <Input placeholder="Full name" autoComplete="name" {...register('contact')} />
            </Field>
            <Field label="Email" required error={e.email?.message}>
              <Input
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                {...register('email')}
              />
            </Field>
            <Field label="Phone" required error={e.phone?.message}>
              <Input type="tel" placeholder="+91 98xxx xxxxx" autoComplete="tel" {...register('phone')} />
            </Field>
            <Field label="Alternative phone" error={e.altPhone?.message}>
              <Input type="tel" placeholder="Optional" {...register('altPhone')} />
            </Field>
          </FormAccordionSection>

          <FormAccordionSection
            step={3}
            title="Address"
            description="Registered business address."
            required
            hasError={sectionHasError('addr1', 'addr2', 'city', 'state', 'pin')}
          >
            <Field label="Address line 1" required wide error={e.addr1?.message}>
              <Input placeholder="Building, street" autoComplete="address-line1" {...register('addr1')} />
            </Field>
            <Field label="Address line 2" wide error={e.addr2?.message}>
              <Input
                placeholder="Area, landmark (optional)"
                autoComplete="address-line2"
                {...register('addr2')}
              />
            </Field>
            <Field label="City" required error={e.city?.message}>
              <Input autoComplete="address-level2" {...register('city')} />
            </Field>
            <Field label="State" error={e.state?.message}>
              <NativeSelect {...register('state')}>
                <option value="">Select</option>
                {opts('state', initial.state)}
              </NativeSelect>
            </Field>
            <Field label="PIN code" required error={e.pin?.message}>
              <Input inputMode="numeric" maxLength={6} autoComplete="postal-code" {...register('pin')} />
            </Field>
          </FormAccordionSection>

          <FormAccordionSection
            step={4}
            title="Social media"
            description="The brand's pages, shared by all of its projects."
            hasError={sectionHasError('instagram', 'facebook', 'youtube', 'socialOther')}
          >
            <Field label="Instagram" error={e.instagram?.message}>
              <Input type="url" placeholder="https://instagram.com/brand" {...register('instagram')} />
            </Field>
            <Field label="Facebook" error={e.facebook?.message}>
              <Input type="url" placeholder="https://facebook.com/brand" {...register('facebook')} />
            </Field>
            <Field label="YouTube" error={e.youtube?.message}>
              <Input type="url" placeholder="https://youtube.com/@brand" {...register('youtube')} />
            </Field>
            <Field label="Other (LinkedIn, X, Pinterest…)" error={e.socialOther?.message}>
              <Input type="url" placeholder="https://" {...register('socialOther')} />
            </Field>
          </FormAccordionSection>

          <FormAccordionSection
            step={5}
            title="Additional information"
            description="Internal notes, branding and account status."
            hasError={sectionHasError('notes', 'status')}
          >
            <Field label="Internal notes" wide error={e.notes?.message}>
              <Textarea placeholder="Visible to your team only." {...register('notes')} />
            </Field>
            <FieldGroup label="Client logo" hint="PNG, JPG, WebP or SVG · max 1 MB">
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong p-3">
                <ClientLogo
                  name={name || 'New Client'}
                  color={existing?.color ?? 'hsl(var(--primary))'}
                  logoUrl={removeLogo ? null : (preview ?? existing?.logoUrl)}
                  size={44}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">
                    {logoFile
                      ? logoFile.name
                      : removeLogo
                        ? 'Logo will be removed'
                        : existing?.logoUrl
                          ? 'Current logo'
                          : 'No logo uploaded'}
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    <ImageUp /> Upload
                    <input
                      type="file"
                      accept={LOGO_TYPES.join(',')}
                      className="sr-only"
                      onChange={ev => pickLogo(ev.target.files?.[0])}
                    />
                  </label>
                </Button>
                {(logoFile || (existing?.logoUrl && !removeLogo)) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove logo"
                    onClick={() => (logoFile ? setLogoFile(null) : setRemoveLogo(true))}
                  >
                    <X />
                  </Button>
                )}
              </div>
            </FieldGroup>
            <FieldGroup
              label="Status"
              hint="Inactive clients are hidden from pickers but keep their history."
            >
              <Segmented
                label="Status"
                value={status}
                onChange={v => setValue('status', v, { shouldDirty: true })}
                options={[
                  ['Active', 'Active'],
                  ['Inactive', 'Inactive']
                ]}
              />
            </FieldGroup>
          </FormAccordionSection>

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t bg-surface-2/95 px-5 py-3.5 backdrop-blur">
            <span className={dirty ? 'text-xs text-warn' : 'text-xs text-muted-foreground'}>
              {dirty ? 'Unsaved changes' : clientId ? `Editing ${existing?.name}` : 'New client'}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(back)}>
                Cancel
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void save('another')}>
                Save &amp; add another
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="animate-spin" />}
                {clientId ? 'Save changes' : 'Save client'}
              </Button>
            </div>
          </div>
        </Card>
      </form>
      <UnsavedChangesGuard
        when={dirty && !busy}
        message="The changes you made to this client will be lost."
      />
    </>
  );
}

function FormSkeleton() {
  return (
    <Card className="space-y-4 p-6" aria-busy>
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </Card>
  );
}
