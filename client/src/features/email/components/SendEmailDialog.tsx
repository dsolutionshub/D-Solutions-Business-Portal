import type { EmailPrefillQuery, EmailSendResult } from '@dsol/shared';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { emailApi } from '../api';
import { type ComposeInitial } from '../compose';

/** The editor (TipTap) is large: load it only when an email is actually being written. */
const ComposeForm = lazy(() => import('./ComposeForm').then(m => ({ default: m.ComposeForm })));

const FormSkeleton = () => (
  <div className="space-y-3">
    <Skeleton className="h-9" />
    <Skeleton className="h-9" />
    <Skeleton className="h-56" />
  </div>
);

const TITLES: Record<EmailPrefillQuery['for'], string> = {
  invoice: 'Email invoice',
  reminder: 'Send payment reminder',
  receipt: 'Email receipt',
  release: 'Send release email'
};

/**
 * A ready-made email for an action (invoice, payment reminder, receipt, release), editable
 * before it goes. `request` null = closed.
 */
export function SendEmailDialog({
  request,
  onOpenChange,
  onSent,
  title
}: {
  request: EmailPrefillQuery | null;
  onOpenChange: (open: boolean) => void;
  onSent?: (r: EmailSendResult) => void;
  title?: string;
}) {
  const q = useQuery({
    queryKey: ['emails', 'prefill', request],
    queryFn: () => emailApi.prefill(request!),
    enabled: !!request,
    gcTime: 0,
    staleTime: Infinity
  });
  const p = q.data;
  const initial = useMemo<ComposeInitial | null>(
    () =>
      p
        ? {
            clientId: p.clientId,
            to: p.to,
            cc: p.cc,
            subject: p.subject,
            html: p.html,
            template: p.template,
            attachments: p.attachments,
            releaseId: p.releaseId
          }
        : null,
    [p]
  );

  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? (request ? TITLES[request.for] : '')}</DialogTitle>
          <DialogDescription>{p ? `${p.clientName} · ${p.template}` : ' '}</DialogDescription>
        </DialogHeader>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn’t prepare the email" />
        ) : !initial ? (
          <FormSkeleton />
        ) : (
          <>
            {p?.warning && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn"
              >
                <AlertTriangle className="size-4" /> {p.warning}
              </p>
            )}
            <Suspense fallback={<FormSkeleton />}>
              <ComposeForm
                initial={initial}
                lockClient
                onCancel={() => onOpenChange(false)}
                onSent={r => {
                  onOpenChange(false);
                  onSent?.(r);
                }}
              />
            </Suspense>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
