import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Mail, Printer } from 'lucide-react';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ReceiptPaper } from '@/features/invoices/components/InvoicePaper';
import { SendEmailDialog } from '@/features/email/components/SendEmailDialog';
import { useCan } from '@/lib/auth';
import { paymentsApi } from '../api';

/** A payment receipt, with a printable version ("Save as PDF") and an email to the client. */
export function ReceiptDialog({
  paymentId,
  onOpenChange
}: {
  paymentId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const canEmail = useCan('emails.send');
  const [mailing, setMailing] = useState(false);
  const q = useQuery({
    queryKey: ['payments', 'detail', paymentId],
    queryFn: () => paymentsApi.get(paymentId!),
    enabled: !!paymentId
  });
  return (
    <Dialog open={!!paymentId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Payment receipt</DialogTitle>
          <DialogDescription>{q.data?.payment.receiptNo ?? ' '}</DialogDescription>
        </DialogHeader>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data ? (
          <ReceiptPaper payment={q.data.payment} seller={q.data.seller} balancePaise={q.data.balancePaise} />
        ) : (
          <Skeleton className="h-72" />
        )}
        <DialogFooter className="gap-2">
          {canEmail && (
            <Button variant="outline" disabled={!paymentId} onClick={() => setMailing(true)}>
              <Mail /> Email receipt
            </Button>
          )}
          <Button asChild disabled={!paymentId}>
            <a
              href={paymentId ? paymentsApi.receiptUrl(paymentId) : '#'}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer /> Download PDF
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
      <SendEmailDialog
        request={mailing && paymentId ? { for: 'receipt', payment: paymentId } : null}
        onOpenChange={setMailing}
      />
    </Dialog>
  );
}
