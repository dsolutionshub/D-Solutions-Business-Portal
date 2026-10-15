import { formatInr, type WorkView } from '@dsol/shared';
import { FilePlus2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Tile } from '@/components/common/Tile';
import { Button } from '@/components/ui/button';
import { WorkItemDialog } from '@/features/work/components/WorkItemDialog';
import { WorkTable } from '@/features/work/components/WorkTable';
import { useWork } from '@/features/work/hooks/useWork';
import { useCan } from '@/lib/auth';

const AWAITING = ['In draft', 'Invoiced', 'Overdue', 'Part paid'];

/** Delivered work for this project: totals, the list, and "Invoice unbilled work". */
export function WorkBillingTab({ projectId, clientId }: { projectId: string; clientId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useWork({ project: projectId, status: 'all', pageSize: 100 });
  const canWrite = useCan('work.write');
  const canInvoice = useCan('invoices.write');
  const [dialog, setDialog] = useState<{ open: boolean; work: WorkView | null }>({ open: false, work: null });
  const items = data?.items ?? [];
  const sum = (statuses: string[]) =>
    items.filter(w => statuses.includes(w.status)).reduce((a, w) => a + w.billablePaise, 0);
  const toBill = items.filter(w => w.status === 'To bill');
  const needsPrice = items.filter(w => w.status === 'Needs price').length;

  return (
    <>
      <div className="grid gap-3 p-5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        <Tile label="Ready to invoice">
          <span className="text-primary-soft-foreground">{formatInr(sum(['To bill']))}</span>
        </Tile>
        <Tile label="Needs a price">
          <span className={needsPrice ? 'text-warn' : ''}>{needsPrice} item(s)</span>
        </Tile>
        <Tile label="Invoiced, awaiting payment">{formatInr(sum(AWAITING))}</Tile>
        <Tile label="Paid">
          <span className="text-ok">{formatInr(sum(['Paid']))}</span>
        </Tile>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">Delivered work</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, work: null })}>
              <Plus /> Log work
            </Button>
          )}
          {canInvoice && (
            <Button
              size="sm"
              disabled={!toBill.length}
              onClick={() => navigate(`/invoices/new?work=${toBill.map(w => w.id).join(',')}`)}
            >
              <FilePlus2 /> Invoice unbilled work
            </Button>
          )}
        </div>
      </div>
      <WorkTable
        rows={data?.items}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        onEdit={w => setDialog({ open: true, work: w })}
      />
      <WorkItemDialog
        open={dialog.open}
        onOpenChange={o => setDialog(d => ({ ...d, open: o }))}
        work={dialog.work}
        defaults={{ clientId, projectId }}
      />
    </>
  );
}
