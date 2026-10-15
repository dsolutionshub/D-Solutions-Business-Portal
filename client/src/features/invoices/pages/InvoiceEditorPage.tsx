import {
  formatInr,
  invoiceCalc,
  invoiceCreateSchema,
  rupeesToPaise,
  workLine,
  type InvoiceDraft,
  type InvoicePaperData
} from '@dsol/shared';
import { useQuery } from '@tanstack/react-query';
import { Eye, Loader2, Mail, Plus, Rocket, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/ErrorState';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { UnsavedChangesGuard } from '@/components/common/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useClient, useClientOptions } from '@/features/clients/hooks/useClients';
import { useProjectsList } from '@/features/projects/hooks/useProjects';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { useSettings } from '@/lib/lookups';
import { invoicesApi } from '../api';
import { AddWorkDialog } from '../components/AddWorkDialog';
import { InvoicePaper } from '../components/InvoicePaper';
import { useInvoice, useInvoiceActions, useSaveInvoice } from '../hooks/useInvoices';

interface LineValues {
  description: string;
  quantity: string;
  /** rupees, as typed */
  unitPrice: string;
  workItemId: string;
  workLabel: string;
}
interface Values {
  clientId: string;
  projectId: string;
  issueDate: string;
  dueDate: string;
  discountPct: string;
  lines: LineValues[];
  paymentInstructions: string;
  notes: string;
  terms: string;
}

const toForm = (d: InvoiceDraft, workLabels: Record<string, string> = {}): Values => ({
  clientId: d.clientId,
  projectId: d.projectId ?? '',
  issueDate: d.issueDate,
  dueDate: d.dueDate,
  discountPct: String(d.discountPct),
  lines: d.lines.map(l => ({
    description: l.description,
    quantity: String(l.quantity),
    unitPrice: l.unitPricePaise ? String(l.unitPricePaise / 100) : '',
    workItemId: l.workItemId ?? '',
    workLabel: l.workItemId ? (workLabels[l.workItemId] ?? 'Delivered work') : ''
  })),
  paymentInstructions: d.paymentInstructions ?? '',
  notes: d.notes ?? '',
  terms: d.terms ?? ''
});

const toBody = (v: Values) => ({
  clientId: v.clientId,
  projectId: v.projectId || null,
  issueDate: v.issueDate,
  dueDate: v.dueDate,
  // no GST on invoices: every invoice saved from here is 0%
  gstRate: 0 as const,
  discountPct: Math.min(100, Math.max(0, Math.round(Number(v.discountPct) || 0))),
  lines: v.lines
    .filter(l => l.description.trim() || l.unitPrice || l.workItemId)
    .map(l => ({
      description: l.description.trim(),
      quantity: Number(l.quantity) || 0,
      unitPricePaise: rupeesToPaise(l.unitPrice) ?? 0,
      workItemId: l.workItemId || null
    })),
  paymentInstructions: v.paymentInstructions.trim() || null,
  notes: v.notes.trim() || null,
  terms: v.terms.trim() || null
});

/** API / schema paths → form fields ("lines.0.unitPricePaise" → "lines.0.unitPrice"). */
const toField = (p: string) => p.replace(/\.unitPricePaise$/, '.unitPrice');

/** Create (/invoices/new?client=…&work=…) and edit a draft (/invoices/:no/edit). */
export function InvoiceEditorPage() {
  const { invoiceNo } = useParams();
  const [params] = useSearchParams();
  const workIds = params.get('work')?.split(',').filter(Boolean) ?? [];
  const client = params.get('client') ?? undefined;
  const existing = useInvoice(invoiceNo);
  const start = useQuery({
    // not under ['invoices']: saving refreshes those, and this one must not re-run once its work is billed
    queryKey: ['invoice-editor-start', workIds.join(','), client],
    queryFn: () => (workIds.length ? invoicesApi.fromWork(workIds) : invoicesApi.defaults(client)),
    enabled: !invoiceNo,
    staleTime: Infinity,
    gcTime: 0
  });

  if (invoiceNo) {
    if (existing.isLoading) return <EditorSkeleton />;
    if (existing.error || !existing.data)
      return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
    const v = existing.data;
    if (v.storedStatus !== 'Draft')
      return (
        <Card>
          <ErrorState
            title={`${v.number} has been issued`}
            error={new Error('Issued invoices can’t be edited. Void it and create a new one if it’s wrong.')}
          />
          <div className="flex justify-center pb-8">
            <Button asChild variant="outline">
              <Link to={`/invoices/${v.number}`}>Back to invoice</Link>
            </Button>
          </div>
        </Card>
      );
    const labels = Object.fromEntries(
      v.work.map(w => [w.id, `${w.projectName}${w.releaseVersion ? ' ' + w.releaseVersion : ''}`])
    );
    return (
      <InvoiceEditor key={v.number} number={v.number} initial={toForm({ ...v, lines: v.lines }, labels)} />
    );
  }
  if (start.isLoading) return <EditorSkeleton />;
  if (start.error || !start.data)
    return (
      <Card>
        <ErrorState error={start.error} onRetry={() => start.refetch()} title="Couldn’t start the invoice" />
        <div className="flex justify-center pb-8">
          <Button asChild variant="outline">
            <Link to="/work">Back to Billable work</Link>
          </Button>
        </div>
      </Card>
    );
  return (
    <InvoiceEditor key={params.toString()} initial={toForm(start.data, {})} fromWork={workIds.length > 0} />
  );
}

function InvoiceEditor({
  number,
  initial,
  fromWork
}: {
  number?: string;
  initial: Values;
  fromWork?: boolean;
}) {
  const navigate = useNavigate();
  const settings = useSettings();
  const clients = useClientOptions();
  const save = useSaveInvoice(number);
  const { issue } = useInvoiceActions();
  const form = useForm<Values>({ defaultValues: initial });
  const { register, control, watch, setValue, setError, clearErrors, formState, reset, getValues } = form;
  const lines = useFieldArray({ control, name: 'lines' });
  const v = watch();
  const client = useClient(v.clientId || undefined);
  const projects = useProjectsList(
    { client: v.clientId || undefined, pageSize: 100, sort: 'name:asc' },
    !!v.clientId
  );
  const [busy, setBusy] = useState<'draft' | 'issue' | null>(null);
  const canEmail = useCan('emails.send');
  const [preview, setPreview] = useState(false);
  const [addWork, setAddWork] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const e = formState.errors;

  useEffect(() => {
    if (leaveTo && !formState.isDirty) navigate(leaveTo);
  }, [leaveTo, formState.isDirty, navigate]);

  // Mark a work-prefilled invoice as unsaved, so leaving asks first.
  useEffect(() => {
    if (fromWork) setValue('notes', initial.notes, { shouldDirty: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const body = toBody(v);
  const totals = invoiceCalc({
    status: 'Draft',
    dueDate: body.dueDate,
    discountPct: body.discountPct,
    gstRate: body.gstRate,
    lines: body.lines,
    payments: []
  });
  const c = client.data;
  const paper: InvoicePaperData = {
    ...totals,
    number: number ?? '',
    status: null,
    issueDate: body.issueDate,
    dueDate: body.dueDate,
    discountPct: body.discountPct,
    gstRate: body.gstRate,
    seller: {
      company: settings.data?.company ?? 'D Solutions',
      address: settings.data?.address ?? null,
      gstin: settings.data?.gstin ?? null
    },
    client: {
      name: c?.name ?? '',
      address: c
        ? [c.addr1, c.addr2, c.city, [c.state, c.pin].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        : '',
      gstin: c?.gstin ?? null,
      terms: c?.paymentTerms ?? null
    },
    projectName: projects.data?.items.find(p => p.id === v.projectId)?.name ?? null,
    lines: body.lines.length ? body.lines : [],
    paymentInstructions: body.paymentInstructions,
    notes: body.notes,
    terms: body.terms
  };

  const onClient = async (clientId: string) => {
    setValue('projectId', '');
    setValue(
      'lines',
      getValues('lines').filter(l => !l.workItemId),
      { shouldDirty: true }
    );
    if (!clientId) return;
    try {
      const d = await invoicesApi.defaults(clientId);
      setValue('dueDate', d.dueDate, { shouldDirty: true });
    } catch {
      /* keep the current due date */
    }
  };

  const validate = (status: 'Draft' | 'Sent') => {
    clearErrors();
    const r = invoiceCreateSchema.safeParse({ ...body, status });
    if (r.success && body.lines.length) return true;
    if (!body.lines.length) toast.error('Add at least one line.');
    let first = true;
    for (const i of r.error?.issues ?? []) {
      setError(toField(i.path.join('.')) as never, { message: i.message }, { shouldFocus: first });
      first = false;
    }
    toast.error('Please fix the highlighted fields.');
    return false;
  };

  /** 'send' = issue, then open the invoice email on the detail page */
  const submit = async (action: 'draft' | 'issue' | 'send') => {
    const mode = action === 'draft' ? 'draft' : 'issue';
    const status = mode === 'issue' ? 'Sent' : 'Draft';
    if (!validate(status)) return;
    setBusy(mode);
    try {
      let saved = await save.mutateAsync({ ...body, status: number ? 'Draft' : status });
      if (number && mode === 'issue') saved = await issue.mutateAsync(number);
      toast.success(mode === 'issue' ? `${saved.number} issued` : `${saved.number} saved as draft`);
      reset(getValues());
      setLeaveTo(`/invoices/${saved.number}${action === 'send' ? '?send=1' : ''}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) applyServerErrors(err, setError, toField);
      else toast.error(err instanceof Error ? err.message : 'Could not save the invoice.');
    } finally {
      setBusy(null);
    }
  };

  const addWorkLines = (work: Parameters<NonNullable<Parameters<typeof AddWorkDialog>[0]['onAdd']>>[0]) => {
    const kept = getValues('lines').filter(l => l.description.trim() || l.unitPrice || l.workItemId);
    const added = work.map(w => {
      const l = workLine(w, w.releaseVersion);
      return {
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPricePaise / 100),
        workItemId: w.id,
        workLabel: `${w.projectName}${w.releaseVersion ? ' ' + w.releaseVersion : ''}`
      };
    });
    setValue('lines', [...kept, ...added], { shouldDirty: true });
    toast.success(`${work.length} item(s) added`);
  };

  const clientName = clients.data?.find(x => x.id === v.clientId)?.name ?? c?.name ?? '';
  return (
    <>
      <PageHeader
        back={{
          to: number ? `/invoices/${number}` : '/invoices',
          label: number ? `Back to ${number}` : 'Back to invoices'
        }}
        title={number ? `Edit draft ${number}` : 'Create invoice'}
        description="The number is assigned when you save. The preview updates as you type."
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(number ? `/invoices/${number}` : '/invoices')}>
              Cancel
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => void submit('draft')}>
              {busy === 'draft' && <Loader2 className="animate-spin" />}
              Save draft
            </Button>
            <Button variant="outline" onClick={() => setPreview(true)}>
              <Eye /> Preview
            </Button>
            <Button
              variant={canEmail ? 'outline' : 'default'}
              disabled={!!busy}
              onClick={() => void submit('issue')}
            >
              {busy === 'issue' ? <Loader2 className="animate-spin" /> : <Send />}
              Issue invoice
            </Button>
            {canEmail && (
              <Button disabled={!!busy} onClick={() => void submit('send')}>
                <Mail /> Issue & send
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[1_1_460px]">
          <form noValidate onSubmit={ev => ev.preventDefault()}>
            <section className="grid gap-4 border-b p-5 sm:grid-cols-2">
              <h2 className="text-[15px] font-semibold sm:col-span-2">Details</h2>
              <Field label="Client" required error={e.clientId?.message}>
                <NativeSelect
                  value={v.clientId}
                  {...register('clientId', { onChange: ev => void onClient(ev.target.value) })}
                >
                  <option value="">Select a client</option>
                  {(clients.data ?? []).map(x => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                  {initial.clientId && !clients.data?.some(x => x.id === initial.clientId) && (
                    <option value={initial.clientId}>{c?.name ?? 'Current client'}</option>
                  )}
                </NativeSelect>
              </Field>
              <Field label="Project" error={e.projectId?.message}>
                <NativeSelect value={v.projectId} {...register('projectId')} disabled={!v.clientId}>
                  <option value="">No project</option>
                  {(projects.data?.items ?? []).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Invoice date" required error={e.issueDate?.message}>
                <Input type="date" {...register('issueDate')} />
              </Field>
              <Field label="Due date" required error={e.dueDate?.message}>
                <Input type="date" {...register('dueDate')} />
              </Field>
              <Field label="Discount (%)" error={e.discountPct?.message}>
                <Input type="number" min={0} max={100} step={1} {...register('discountPct')} />
              </Field>
            </section>

            <section className="flex flex-col gap-3 border-b p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[15px] font-semibold">Line items</h2>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!v.clientId}
                    title={v.clientId ? undefined : 'Select a client first'}
                    onClick={() => setAddWork(true)}
                  >
                    <Rocket /> Add delivered work
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      lines.append({
                        description: '',
                        quantity: '1',
                        unitPrice: '',
                        workItemId: '',
                        workLabel: ''
                      })
                    }
                  >
                    <Plus /> Add line
                  </Button>
                </div>
              </div>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[460px] text-[13px]">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Description</th>
                      <th className="w-16 py-2 font-medium">Qty</th>
                      <th className="w-28 py-2 font-medium">Unit price (₹)</th>
                      <th className="w-24 py-2 text-right font-medium">Amount</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.fields.map((f, i) => {
                      const line = v.lines[i];
                      const err = e.lines?.[i];
                      return (
                        <tr key={f.id} className="align-top">
                          <td className="py-1.5 pr-2">
                            <Input
                              placeholder="Service or item"
                              aria-label={`Line ${i + 1} description`}
                              aria-invalid={!!err?.description || undefined}
                              {...register(`lines.${i}.description`)}
                            />
                            {line?.workItemId && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                <Rocket className="size-3" /> Delivered work · {line.workLabel}
                              </div>
                            )}
                            {(err?.description?.message || err?.workItemId?.message) && (
                              <div role="alert" className="mt-1 text-xs text-destructive">
                                {err?.workItemId?.message ?? err?.description?.message}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.5"
                              aria-label={`Line ${i + 1} quantity`}
                              aria-invalid={!!err?.quantity || undefined}
                              {...register(`lines.${i}.quantity`)}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              aria-label={`Line ${i + 1} unit price`}
                              aria-invalid={!!err?.unitPrice || undefined}
                              {...register(`lines.${i}.unitPrice`)}
                            />
                            {err?.unitPrice?.message && (
                              <div className="mt-1 text-xs text-destructive">{err.unitPrice.message}</div>
                            )}
                          </td>
                          <td className="py-3.5 text-right font-semibold tabular-nums">
                            {formatInr(
                              Math.round(
                                (Number(line?.quantity) || 0) * (rupeesToPaise(line?.unitPrice ?? '') ?? 0)
                              )
                            )}
                          </td>
                          <td className="py-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={lines.fields.length < 2}
                              onClick={() => lines.remove(i)}
                              aria-label={`Remove line ${i + 1}`}
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="ml-auto flex w-full max-w-[280px] flex-col gap-1.5 text-[13px]">
                <Row label="Subtotal" value={formatInr(totals.subtotalPaise)} />
                {!!totals.discountPaise && (
                  <Row
                    label={`Discount (${body.discountPct}%)`}
                    value={`− ${formatInr(totals.discountPaise)}`}
                  />
                )}
                <div className="flex justify-between border-t pt-2 text-base font-bold">
                  <span>Grand total</span>
                  <span>{formatInr(totals.totalPaise)}</span>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-4 p-5">
              <h2 className="text-[15px] font-semibold">Payment &amp; notes</h2>
              <Field label="Payment instructions">
                <Textarea rows={3} {...register('paymentInstructions')} />
              </Field>
              <Field label="Notes" hint="Shown on the invoice">
                <Textarea rows={2} {...register('notes')} />
              </Field>
              <Field label="Terms" hint="Leave empty for the standard terms">
                <Textarea rows={2} {...register('terms')} />
              </Field>
            </section>
          </form>
        </Card>
        <div className="min-w-0 flex-[1_1_520px] lg:sticky lg:top-20">
          <div className="mb-2 flex justify-between text-xs text-muted-foreground">
            <span>Live preview</span>
            <span>A4 · INR</span>
          </div>
          <InvoicePaper data={paper} />
        </div>
      </div>

      <AddWorkDialog
        open={addWork}
        onOpenChange={setAddWork}
        clientId={v.clientId}
        clientName={clientName}
        projectId={v.projectId}
        exclude={v.lines.map(l => l.workItemId).filter(Boolean)}
        onAdd={addWorkLines}
      />
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice preview</DialogTitle>
          </DialogHeader>
          <InvoicePaper data={paper} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreview(false)}>
              Back to editing
            </Button>
            <Button onClick={() => (setPreview(false), void submit('issue'))}>
              <Send /> Issue invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UnsavedChangesGuard when={formState.isDirty && !busy} message="This invoice hasn’t been saved." />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex flex-wrap gap-4" aria-busy>
      <Card className="flex-[1_1_460px] space-y-3 p-5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </Card>
      <Skeleton className="h-[480px] flex-[1_1_520px] rounded-xl" />
    </div>
  );
}
