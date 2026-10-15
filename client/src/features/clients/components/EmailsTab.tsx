import { Send } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useEmails } from '@/features/email/api';
import { EmailTable } from '@/features/email/components/EmailTable';
import { useCan } from '@/lib/auth';

/** Client → Emails: everything sent to this client's contacts. */
export function EmailsTab({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1);
  const canSend = useCan('emails.send');
  const q = useEmails({ client: clientId, page, pageSize: 10 });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold">Emails</h2>
          <p className="text-xs text-muted-foreground">Communication sent to this client.</p>
        </div>
        {canSend && (
          <Button asChild size="sm">
            <Link to={`/email/compose?client=${clientId}`}>
              <Send /> Compose
            </Link>
          </Button>
        )}
      </div>
      <EmailTable
        rows={q.data?.items}
        loading={q.isLoading}
        error={q.error}
        onRetry={q.refetch}
        showClient={false}
        pagination={
          q.data && {
            page: q.data.page,
            pageSize: q.data.pageSize,
            total: q.data.total,
            onPageChange: setPage
          }
        }
      />
    </div>
  );
}
