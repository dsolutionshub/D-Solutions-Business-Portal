import { formatInr } from '@dsol/shared';
import { CreditCard, FilePlus2, Rocket } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InvoiceTable } from '@/features/invoices/components/InvoiceTable';
import { useInvoices } from '@/features/invoices/hooks/useInvoices';
import { PaymentTable } from '@/features/payments/components/PaymentTable';
import { ReceiptDialog } from '@/features/payments/components/ReceiptDialog';
import { RecordPaymentDialog } from '@/features/payments/components/RecordPaymentDialog';
import { usePayments } from '@/features/payments/hooks/usePayments';
import { useWork } from '@/features/work/hooks/useWork';
import { useCan } from '@/lib/auth';

/** A client's invoices and payments, with the "₹X ready to invoice" banner. Shown to roles that can read invoices. */
export function InvoicesPaymentsTab({ clientId, archived }: { clientId: string; archived?: boolean }) {
  const navigate = useNavigate();
  const canWrite = useCan('invoices.write');
  const canPay = useCan('payments.record');
  const [invPage, setInvPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const invoices = useInvoices({
    client: clientId,
    status: 'all',
    page: invPage,
    pageSize: 10,
    sort: 'date:desc'
  });
  const payments = usePayments({ client: clientId, page: payPage, pageSize: 10 });
  const ready = useWork({ client: clientId, status: 'To bill', pageSize: 100 });
  const [paying, setPaying] = useState<{ open: boolean; no?: string }>({ open: false });
  const [receipt, setReceipt] = useState<string | null>(null);

  const readyItems = ready.data?.items ?? [];
  const readyTotal = readyItems.reduce((a, w) => a + w.billablePaise, 0);

  return (
    <div className="flex flex-col gap-4">
      {readyItems.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-info-bg px-4 py-3 text-sm text-info"
        >
          <Rocket className="size-4" />
          <span className="flex-1">
            <b>{formatInr(readyTotal)}</b> ready to invoice · {readyItems.length} delivered item(s) not yet
            billed
          </span>
          <Button asChild size="sm" variant="outline">
            <Link to={`/work?client=${clientId}&status=To bill`}>Review work</Link>
          </Button>
          {canWrite && !archived && (
            <Button
              size="sm"
              onClick={() => navigate(`/invoices/new?work=${readyItems.map(w => w.id).join(',')}`)}
            >
              <FilePlus2 /> Invoice all
            </Button>
          )}
        </div>
      )}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">Invoices</h2>
          <div className="flex gap-2">
            {canPay && (
              <Button size="sm" variant="outline" onClick={() => setPaying({ open: true })}>
                <CreditCard /> Record payment
              </Button>
            )}
            {canWrite && !archived && (
              <Button size="sm" asChild>
                <Link to={`/invoices/new?client=${clientId}`}>
                  <FilePlus2 /> Create invoice
                </Link>
              </Button>
            )}
          </div>
        </div>
        <InvoiceTable
          rows={invoices.data?.items}
          loading={invoices.isLoading}
          error={invoices.error}
          onRetry={invoices.refetch}
          showClient={false}
          onRecordPayment={no => setPaying({ open: true, no })}
          pagination={
            invoices.data && {
              page: invoices.data.page,
              pageSize: invoices.data.pageSize,
              total: invoices.data.total,
              onPageChange: setInvPage
            }
          }
        />
      </Card>
      <Card>
        <div className="border-b px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">Payments</h2>
        </div>
        <PaymentTable
          rows={payments.data?.items}
          loading={payments.isLoading}
          error={payments.error}
          onRetry={payments.refetch}
          showClient={false}
          onReceipt={setReceipt}
          pagination={
            payments.data && {
              page: payments.data.page,
              pageSize: payments.data.pageSize,
              total: payments.data.total,
              onPageChange: setPayPage
            }
          }
        />
      </Card>
      <RecordPaymentDialog
        open={paying.open}
        onOpenChange={o => setPaying(p => ({ ...p, open: o }))}
        invoiceNo={paying.no}
        clientId={clientId}
        onRecorded={setReceipt}
      />
      <ReceiptDialog paymentId={receipt} onOpenChange={o => !o && setReceipt(null)} />
    </div>
  );
}
