import { formatDate, formatInr } from '@dsol/shared';
import { Bell, Copy, CreditCard, Mail, Pencil, Printer, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { BackButton } from '@/components/common/BackButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ReceiptDialog } from '@/features/payments/components/ReceiptDialog';
import { RecordPaymentDialog } from '@/features/payments/components/RecordPaymentDialog';
import { SendEmailDialog } from '@/features/email/components/SendEmailDialog';
import { useCan } from '@/lib/auth';
import { invoicesApi } from '../api';
import { InvoicePaper } from '../components/InvoicePaper';
import { useInvoice, useInvoiceActions } from '../hooks/useInvoices';

export function InvoiceDetailPage() {
  const { invoiceNo = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: v, isLoading, error, refetch } = useInvoice(invoiceNo);
  const actions = useInvoiceActions();
  const canWrite = useCan('invoices.write');
  const canVoid = useCan('invoices.void');
  const canPay = useCan('payments.record');
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'void' | 'issue' | 'issue-send' | null>(null);
  const [mailing, setMailing] = useState<'invoice' | 'reminder' | null>(null);
  const canEmail = useCan('emails.send');

  const payable = !!v && v.storedStatus === 'Sent' && v.balancePaise > 0;

  // ?send=1 (after "Issue & send" in the editor) opens the invoice email.
  useEffect(() => {
    if (params.get('send') && v?.storedStatus === 'Sent' && canEmail) {
      setMailing('invoice');
      setParams(p => (p.delete('send'), p), { replace: true });
    }
  }, [params, v?.storedStatus, canEmail, setParams]);

  // /invoices/:no?pay=1 (from a work row's "Record payment") opens the payment dialog.
  useEffect(() => {
    if (params.get('pay') && payable && canPay) {
      setPaying(true);
      setParams(p => (p.delete('pay'), p), { replace: true });
    }
  }, [params, payable, canPay, setParams]);

  const back = (
    <div>
      <BackButton to="/invoices" label="Back to invoices" />
    </div>
  );
  if (isLoading)
    return (
      <>
        {back}
        <Skeleton className="h-10 w-72" />
        <div className="flex flex-wrap gap-4">
          <Skeleton className="h-[560px] min-w-0 flex-[2_1_520px] rounded-xl" />
          <Skeleton className="h-72 min-w-0 flex-[1_1_280px] rounded-xl" />
        </div>
      </>
    );
  if (error || !v)
    return (
      <>
        {back}
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} title={`Couldn’t load ${invoiceNo}`} />
        </Card>
      </>
    );

  const draft = v.storedStatus === 'Draft';
  const voided = v.status === 'Void';
  const pct = v.totalPaise ? Math.min(100, Math.round((v.paidPaise / v.totalPaise) * 100)) : 0;

  return (
    <>
      <PageHeader
        back={{ to: '/invoices', label: 'Back to invoices' }}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono">{v.number}</span> <StatusBadge status={v.status} />
          </span>
        }
        description={`${v.clientName}${v.projectName ? ` · ${v.projectName}` : ''} · issued ${formatDate(v.issueDate)} · due ${formatDate(v.dueDate)}`}
        actions={
          draft ? (
            canWrite && (
              <>
                <Button variant="outline" onClick={() => navigate(`/invoices/${v.number}/edit`)}>
                  <Pencil /> Edit draft
                </Button>
                <Button variant="outline" onClick={() => setConfirm('issue')}>
                  <Send /> Issue invoice
                </Button>
                {canEmail && (
                  <Button onClick={() => setConfirm('issue-send')}>
                    <Mail /> Issue & send
                  </Button>
                )}
              </>
            )
          ) : (
            <>
              <Button variant="outline" asChild>
                <a href={invoicesApi.pdfUrl(v.number)} target="_blank" rel="noopener noreferrer">
                  <Printer /> Download PDF
                </a>
              </Button>
              {canEmail && !voided && (
                <Button variant="outline" onClick={() => setMailing('invoice')}>
                  <Mail /> Email invoice
                </Button>
              )}
              {canWrite && (
                <Button
                  variant="outline"
                  disabled={actions.duplicate.isPending}
                  onClick={() =>
                    actions.duplicate.mutate(v.number, { onSuccess: d => navigate(`/invoices/${d.number}`) })
                  }
                >
                  <Copy /> Duplicate
                </Button>
              )}
              {canVoid && !voided && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={v.paidPaise > 0}
                  title={v.paidPaise > 0 ? 'Invoices with payments can’t be voided' : undefined}
                  onClick={() => setConfirm('void')}
                >
                  <Trash2 /> Void
                </Button>
              )}
              {canPay && payable && (
                <Button onClick={() => setPaying(true)}>
                  <CreditCard /> Record payment
                </Button>
              )}
            </>
          )
        }
      />

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[2_1_520px]">
          <InvoicePaper data={v.paper} />
        </div>
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
          <Card className="flex flex-col gap-2.5 p-5 text-[13px]">
            <h2 className="text-[15px] font-semibold">Summary</h2>
            <Row label="Total" value={formatInr(v.totalPaise)} />
            <Row label="Paid" value={formatInr(v.paidPaise)} />
            <div className="flex justify-between border-t pt-2.5 text-base font-bold">
              <span>Balance due</span>
              <span className={v.status === 'Overdue' ? 'text-bad' : ''}>
                {voided ? '—' : formatInr(v.balancePaise)}
              </span>
            </div>
            {!draft && !voided && (
              <div className="mt-1">
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Paid"
                >
                  <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{pct}% paid</div>
              </div>
            )}
            {!draft && !voided && v.balancePaise > 0 && canEmail && (
              <Button variant="outline" size="sm" onClick={() => setMailing('reminder')}>
                <Bell /> Send payment reminder
              </Button>
            )}
            {voided && (
              <p className="text-xs text-muted-foreground">
                Voided — kept on record for audit. Its delivered work went back to “To bill”.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-[15px] font-semibold">Payments</h2>
            {v.payments.length ? (
              <ul className="divide-y text-[13px]">
                {v.payments.map(p => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="font-semibold">{formatInr(p.amountPaise)}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatDate(p.paidOn)} · {p.method} · <span className="font-mono">{p.reference}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setReceipt(p.id)}>
                      Receipt
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">No payments yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-[15px] font-semibold">Delivered work billed</h2>
            {v.work.length ? (
              <ul className="divide-y text-[13px]">
                {v.work.map(w => (
                  <li key={w.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{w.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {w.projectName}
                        {w.releaseVersion && ` · ${w.releaseVersion}`}
                      </div>
                    </div>
                    <StatusBadge status={w.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No delivered work is linked to this invoice.
              </p>
            )}
          </Card>
        </div>
      </div>

      <RecordPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        invoiceNo={v.number}
        clientId={v.clientId}
        onRecorded={setReceipt}
      />
      <ReceiptDialog paymentId={receipt} onOpenChange={o => !o && setReceipt(null)} />
      <ConfirmDialog
        open={confirm === 'void'}
        onOpenChange={o => !o && setConfirm(null)}
        title={`Void ${v.number}?`}
        description="The invoice stays on record as Void for audit and can no longer be paid or edited. Its delivered work goes back to “To bill”. This cannot be undone."
        confirmLabel="Void invoice"
        pending={actions.void.isPending}
        onConfirm={() => actions.void.mutate(v.number, { onSettled: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'issue' || confirm === 'issue-send'}
        onOpenChange={o => !o && setConfirm(null)}
        title={`Issue ${v.number}?`}
        description={
          'Issued invoices can’t be edited. If something is wrong later, void it and create a new one.' +
          (confirm === 'issue-send' ? ' Next you can check the email before it goes to the client.' : '')
        }
        confirmLabel={confirm === 'issue-send' ? 'Issue & write email' : 'Issue invoice'}
        destructive={false}
        pending={actions.issue.isPending}
        onConfirm={() =>
          actions.issue.mutate(v.number, {
            onSuccess: () => confirm === 'issue-send' && setMailing('invoice'),
            onSettled: () => setConfirm(null)
          })
        }
      />
      <SendEmailDialog
        request={mailing && { for: mailing, invoice: v.number }}
        onOpenChange={o => !o && setMailing(null)}
      />
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
