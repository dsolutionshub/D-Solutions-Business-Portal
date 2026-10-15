import { paiseToRupees, rupeesToPaise, settingsUpdateSchema } from '@dsol/shared';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/ErrorState';
import { Field } from '@/components/common/Field';
import { FormAccordionSection } from '@/components/common/FormAccordion';
import { MoneyInput } from '@/components/common/MoneyInput';
import { UnsavedChangesGuard } from '@/components/common/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';
import { useSettings, type SettingsView } from '@/lib/lookups';
import { useSaveSettings } from '../api';

interface Values {
  company: string;
  gstin: string;
  address: string;
  bank: string;
  upi: string;
  invoicePrefix: string;
  nextInvoiceNo: string;
  hourlyRate: string;
  emailFromName: string;
  emailFromAddress: string;
  timezone: string;
  emailDailyLimit: string;
  clientOverdueReminders: boolean;
}

const toForm = (s: SettingsView): Values => ({
  company: s.company,
  gstin: s.gstin ?? '',
  address: s.address ?? '',
  bank: s.bank ?? '',
  upi: s.upi ?? '',
  invoicePrefix: s.invoicePrefix,
  nextInvoiceNo: String(s.nextInvoiceNo),
  hourlyRate: String(paiseToRupees(s.hourlyRatePaise)),
  emailFromName: s.emailFromName ?? '',
  emailFromAddress: s.emailFromAddress ?? '',
  timezone: s.timezone,
  emailDailyLimit: String(s.emailDailyLimit),
  clientOverdueReminders: s.clientOverdueReminders
});

const n = (v: string) => (v.trim() === '' ? NaN : Number(v));
const orNull = (v: string) => v.trim() || null;
/** form field names for API paths */
const FIELD: Record<string, keyof Values> = { hourlyRatePaise: 'hourlyRate' };

/** Settings → Company & invoicing (+ email sender and reminders). Roles with “Change settings” edit; others read. */
export function CompanyInvoicingTab() {
  const q = useSettings();
  const save = useSaveSettings();
  const canEdit = useCan('settings.write');
  const form = useForm<Values>();
  const { register, handleSubmit, reset, setError, formState, watch, setValue } = form;
  const e = formState.errors;

  useEffect(() => {
    if (q.data) reset(toForm(q.data));
  }, [q.data, reset]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  const s = q.data;

  const submit = handleSubmit(async v => {
    const body = {
      company: v.company.trim(),
      gstin: orNull(v.gstin),
      address: orNull(v.address),
      bank: orNull(v.bank),
      upi: orNull(v.upi),
      invoicePrefix: v.invoicePrefix.trim(),
      nextInvoiceNo: n(v.nextInvoiceNo),
      hourlyRatePaise: rupeesToPaise(v.hourlyRate) ?? NaN,
      emailFromName: orNull(v.emailFromName),
      emailFromAddress: orNull(v.emailFromAddress),
      timezone: v.timezone.trim(),
      emailDailyLimit: n(v.emailDailyLimit),
      clientOverdueReminders: v.clientOverdueReminders
    };
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      let first = true;
      for (const i of parsed.error.issues) {
        const key = String(i.path[0]);
        setError(FIELD[key] ?? (key as keyof Values), { message: i.message }, { shouldFocus: first });
        first = false;
      }
      return void toast.error('Please fix the highlighted fields.');
    }
    if (body.nextInvoiceNo < s.nextInvoiceNo) {
      setError('nextInvoiceNo', {
        message: `It can only go up — the next number is already ${s.nextInvoiceNo}.`
      });
      return void toast.error('Please fix the highlighted fields.');
    }
    try {
      const saved = await save.mutateAsync(parsed.data);
      reset(toForm(saved));
      toast.success('Settings saved');
    } catch (err) {
      applyServerErrors(err, setError, p => FIELD[p] ?? p);
    }
  });

  const hasError = (...names: (keyof typeof e)[]) => names.some(n => !!e[n]);

  return (
    <form noValidate onSubmit={submit}>
      {!canEdit && (
        <p className="mx-5 mt-5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Your role can’t change settings.
        </p>
      )}
      {/* the section headers stay clickable for everyone; only the fields are locked */}
      <FormAccordionSection
        step={1}
        title="Company"
        description="Name, GSTIN, address, bank and UPI — shown on invoices and receipts."
        defaultOpen
        hasError={hasError('company', 'gstin', 'address', 'bank', 'upi')}
      >
        <fieldset disabled={!canEdit} className="contents">
          <Field label="Company name" required error={e.company?.message}>
            <Input {...register('company')} />
          </Field>
          <Field label="GSTIN" error={e.gstin?.message}>
            <Input className="font-mono uppercase" maxLength={15} {...register('gstin')} />
          </Field>
          <Field label="Registered address" wide error={e.address?.message}>
            <Textarea rows={2} {...register('address')} />
          </Field>
          <Field label="Bank details (shown on invoices)" wide error={e.bank?.message}>
            <Input {...register('bank')} />
          </Field>
          <Field label="UPI ID" error={e.upi?.message}>
            <Input {...register('upi')} />
          </Field>
        </fieldset>
      </FormAccordionSection>
      <FormAccordionSection
        step={2}
        title="Invoicing"
        description="Invoice numbering and the default hourly rate."
        hasError={hasError('invoicePrefix', 'nextInvoiceNo', 'hourlyRate')}
      >
        <fieldset disabled={!canEdit} className="contents">
          <Field label="Invoice number prefix" required error={e.invoicePrefix?.message}>
            <Input className="font-mono" {...register('invoicePrefix')} />
          </Field>
          <Field label="Next invoice number" required hint="Can only go up" error={e.nextInvoiceNo?.message}>
            <Input type="number" min={s.nextInvoiceNo} step={1} {...register('nextInvoiceNo')} />
          </Field>
          <Field
            label="Default hourly rate (₹)"
            hint="Used for hourly fixes and support"
            error={e.hourlyRate?.message}
          >
            <MoneyInput step="1" {...register('hourlyRate')} />
          </Field>
        </fieldset>
      </FormAccordionSection>
      <FormAccordionSection
        step={3}
        title="Email & reminders"
        description={`Sender, daily limit and overdue reminders. Empty sender = ${s.emailDefaults.name} <${s.emailDefaults.address}>.`}
        hasError={hasError('emailFromName', 'emailFromAddress', 'emailDailyLimit', 'timezone')}
      >
        <fieldset disabled={!canEdit} className="contents">
          <Field label="Sender name" error={e.emailFromName?.message}>
            <Input placeholder={s.emailDefaults.name} {...register('emailFromName')} />
          </Field>
          <Field
            label="Sender email"
            hint="Must be a sender verified in Brevo"
            error={e.emailFromAddress?.message}
          >
            <Input type="email" placeholder={s.emailDefaults.address} {...register('emailFromAddress')} />
          </Field>
          <Field
            label="Daily email limit"
            hint="Brevo’s free plan allows 300 a day; sending stops at this many recipients"
            error={e.emailDailyLimit?.message}
          >
            <Input type="number" min={1} step={1} {...register('emailDailyLimit')} />
          </Field>
          <Field
            label="Reminder time zone"
            hint="Reminder days are counted in this zone"
            error={e.timezone?.message}
          >
            <Input {...register('timezone')} />
          </Field>
          <div className="col-span-full flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
            <div>
              <div className="font-semibold">Email clients about overdue invoices</div>
              <div className="text-xs text-muted-foreground">
                The daily run sends the Payment Reminder template to the client’s billing contact on the
                “Overdue payments” reminder days.
              </div>
            </div>
            <Switch
              checked={!!watch('clientOverdueReminders')}
              onCheckedChange={v => setValue('clientOverdueReminders', v, { shouldDirty: true })}
              aria-label="Email clients about overdue invoices"
            />
          </div>
          {s.emailDevMode && (
            <p className="col-span-full text-xs text-purple">
              Development mode: no Brevo key is set, so emails are logged, not sent.
            </p>
          )}
        </fieldset>
      </FormAccordionSection>
      {canEdit && (
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={!formState.isDirty}
            onClick={() => reset(toForm(s))}
          >
            Reset
          </Button>
          <Button type="submit" disabled={save.isPending || !formState.isDirty}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save settings
          </Button>
        </div>
      )}
      <UnsavedChangesGuard
        when={formState.isDirty && !save.isPending}
        message="Your settings haven’t been saved."
      />
    </form>
  );
}
