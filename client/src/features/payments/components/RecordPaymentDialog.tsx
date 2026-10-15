import { formatInr, PAYMENT_METHODS, rupeesToPaise, todayIso, type PaymentMethod } from '@dsol/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Field } from '@/components/common/Field';
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
import { Textarea } from '@/components/ui/textarea';
import { useInvoices } from '@/features/invoices/hooks/useInvoices';
import { applyServerErrors } from '@/lib/forms';
import { useRecordPayment } from '../hooks/usePayments';

type Values = {
  invoiceNo: string;
  amount: string;
  paidOn: string;
  method: PaymentMethod;
  reference: string;
  note: string;
};

/**
 * Record a (partial) payment against an open invoice. Afterwards the toast says what changed
 * ("invoice settled · 2 work items now Paid") and the receipt opens.
 */
export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoiceNo,
  clientId,
  onRecorded
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNo?: string;
  clientId?: string;
  onRecorded?: (paymentId: string) => void;
}) {
  const invoices = useInvoices({ client: clientId, status: 'all', pageSize: 100, sort: 'due:asc' }, open);
  const record = useRecordPayment();
  const openInvoices = useMemo(
    () => (invoices.data?.items ?? []).filter(v => v.storedStatus === 'Sent' && v.balancePaise > 0),
    [invoices.data]
  );
  const { register, handleSubmit, formState, reset, watch, setValue, setError, clearErrors } =
    useForm<Values>();
  const e = formState.errors;
  const selected = openInvoices.find(v => v.number === watch('invoiceNo'));

  useEffect(() => {
    if (!open) return;
    reset({
      invoiceNo: invoiceNo ?? '',
      amount: '',
      paidOn: todayIso(),
      method: 'NEFT',
      reference: '',
      note: ''
    });
  }, [open, invoiceNo, reset]);

  // Prefill the balance due whenever the dialog opens or the invoice / its balance changes.
  useEffect(() => {
    if (open && selected) setValue('amount', String(selected.balancePaise / 100));
  }, [open, selected?.number, selected?.balancePaise]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = handleSubmit(async v => {
    clearErrors();
    const amountPaise = rupeesToPaise(v.amount) ?? 0;
    const problems: [keyof Values, string][] = [];
    if (!v.invoiceNo) problems.push(['invoiceNo', 'Select the invoice being paid.']);
    if (!(amountPaise > 0)) problems.push(['amount', 'Enter an amount greater than zero.']);
    else if (selected && amountPaise > selected.balancePaise)
      problems.push(['amount', `Exceeds balance due (${formatInr(selected.balancePaise)}).`]);
    if (v.paidOn > todayIso()) problems.push(['paidOn', 'Date cannot be in the future.']);
    if (v.reference.trim().length < 4) problems.push(['reference', 'Enter the UTR or reference number.']);
    if (problems.length) {
      problems.forEach(([f, message]) => setError(f, { message }));
      return void toast.error('Please fix the highlighted fields.');
    }
    try {
      const r = await record.mutateAsync({
        invoiceNo: v.invoiceNo,
        amountPaise,
        paidOn: v.paidOn,
        method: v.method,
        reference: v.reference.trim(),
        note: v.note.trim() || null
      });
      toast.success(
        `${formatInr(amountPaise)} recorded on ${v.invoiceNo} · ` +
          (r.settled
            ? `invoice settled${r.workPaid ? ` · ${r.workPaid} work item${r.workPaid === 1 ? '' : 's'} now Paid` : ''}`
            : `${formatInr(r.invoice.balancePaise)} still due`)
      );
      onOpenChange(false);
      onRecorded?.(r.payment.id);
    } catch (err) {
      applyServerErrors(err, setError, p => (p === 'amountPaise' ? 'amount' : p));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Partial payments are allowed — the balance updates automatically.
            </DialogDescription>
          </DialogHeader>
          <Field
            label="Invoice"
            required
            error={e.invoiceNo?.message}
            hint={selected && `Balance due ${formatInr(selected.balancePaise)}`}
          >
            <NativeSelect value={watch('invoiceNo') ?? ''} {...register('invoiceNo')}>
              <option value="">
                {invoices.isLoading
                  ? 'Loading open invoices…'
                  : openInvoices.length
                    ? 'Select an open invoice'
                    : 'No open invoices'}
              </option>
              {openInvoices.map(v => (
                <option key={v.number} value={v.number}>
                  {v.number} · {v.clientName} · {formatInr(v.balancePaise)} due
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)" required error={e.amount?.message}>
              <MoneyInput step="0.01" {...register('amount')} />
            </Field>
            <Field label="Payment date" error={e.paidOn?.message}>
              <Input type="date" max={todayIso()} {...register('paidOn')} />
            </Field>
            <Field label="Payment method">
              <NativeSelect {...register('method')}>
                {PAYMENT_METHODS.map(m => (
                  <option key={m}>{m}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Transaction reference" required error={e.reference?.message}>
              <Input placeholder="UTR / cheque no." {...register('reference')} />
            </Field>
          </div>
          <Field label="Note">
            <Textarea rows={2} placeholder="Optional — e.g. TDS deducted 2%" {...register('note')} />
          </Field>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && <Loader2 className="animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
