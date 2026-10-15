import { type EmailView } from '@dsol/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column, type PaginationState } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
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
import { useCan } from '@/lib/auth';
import { useSettings } from '@/lib/lookups';
import { emailApi, useEmailActions } from '../api';
import { EmailPreview } from './EmailPreview';

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata'
      })
    : '—';

/** Email history: subject, client, recipients, template, sent / scheduled, status, and an action per status. */
export function EmailTable({
  rows,
  loading,
  error,
  onRetry,
  pagination,
  showClient = true
}: {
  rows: EmailView[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  pagination?: PaginationState;
  showClient?: boolean;
}) {
  const canSend = useCan('emails.send');
  const { resend, cancel } = useEmailActions();
  const [viewing, setViewing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<EmailView | null>(null);

  const columns: Column<EmailView>[] = [
    {
      id: 'subject',
      header: 'Subject',
      cell: e => (
        <button
          type="button"
          className="max-w-[320px] truncate text-left font-semibold hover:underline"
          onClick={() => setViewing(e.id)}
        >
          {e.subject}
        </button>
      )
    },
    ...(showClient
      ? [
          {
            id: 'client',
            header: 'Client',
            cell: (e: EmailView) =>
              e.kind === 'digest' ? (
                <span className="text-muted-foreground">Team digest</span>
              ) : (
                (e.clientName ?? '—')
              )
          }
        ]
      : []),
    {
      id: 'to',
      header: 'Recipients',
      cell: e => <span className="block max-w-[220px] truncate text-muted-foreground">{e.toText}</span>
    },
    {
      id: 'template',
      header: 'Template',
      cell: e => <span className="text-muted-foreground">{e.templateName ?? 'Custom'}</span>
    },
    {
      id: 'when',
      header: 'Sent / scheduled',
      cell: e => (
        <span className="whitespace-nowrap text-muted-foreground">
          {e.status === 'Draft' ? '—' : when(e.sendAt)}
        </span>
      )
    },
    {
      id: 'status',
      header: 'Status',
      cell: e => <StatusBadge status={e.status} title={e.error ?? undefined} />
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: e =>
        e.status === 'Failed' && canSend ? (
          <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate(e.id)}>
            Retry
          </Button>
        ) : e.status === 'Scheduled' && canSend ? (
          <Button size="sm" variant="outline" onClick={() => setCancelling(e)}>
            Cancel
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setViewing(e.id)}>
            View
          </Button>
        )
    }
  ];

  return (
    <>
      <DataTable
        label="Emails"
        columns={columns}
        rows={rows}
        getRowId={e => e.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        pagination={pagination}
        empty={<EmptyState title="No emails" description="Nothing matches this view." />}
      />
      <EmailViewDialog id={viewing} onOpenChange={o => !o && setViewing(null)} />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={o => !o && setCancelling(null)}
        title="Cancel scheduled email?"
        description={`“${cancelling?.subject}” will be moved back to drafts.`}
        confirmLabel="Cancel send"
        pending={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id, { onSettled: () => setCancelling(null) })}
      />
    </>
  );
}

function EmailViewDialog({ id, onOpenChange }: { id: string | null; onOpenChange: (o: boolean) => void }) {
  const q = useQuery({ queryKey: ['emails', 'detail', id], queryFn: () => emailApi.get(id!), enabled: !!id });
  const settings = useSettings().data;
  const e = q.data;
  const from = settings
    ? `${settings.emailFromName || settings.emailDefaults.name} <${settings.emailFromAddress || settings.emailDefaults.address}>`
    : '';
  return (
    <Dialog open={!!id} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email</DialogTitle>
          <DialogDescription>
            {e ? (
              <>
                {e.status} · {when(e.sendAt)}
                {e.sentByName && ` · by ${e.sentByName}`}
              </>
            ) : (
              ' '
            )}
          </DialogDescription>
        </DialogHeader>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !e ? (
          <Skeleton className="h-64" />
        ) : (
          <>
            {e.error && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{e.error}</p>}
            {e.bodyHtml ? (
              <EmailPreview
                from={from}
                to={e.toAddresses}
                cc={e.ccAddresses}
                subject={e.subject}
                html={e.bodyHtml}
                attachments={
                  e.invoiceNo
                    ? [{ kind: 'invoice', invoiceNo: e.invoiceNo }]
                    : e.paymentId
                      ? [{ kind: 'receipt', paymentId: e.paymentId }]
                      : []
                }
              />
            ) : (
              <p className="rounded-lg bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
                This email was sent before message bodies were stored in the portal.
              </p>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
