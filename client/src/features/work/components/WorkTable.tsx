import { formatDate, formatInr, type WorkView } from '@dsol/shared';
import { Check, CreditCard, FilePlus2, FileText, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column, type PaginationState } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { RowMenu } from '@/components/common/RowMenu';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useCan } from '@/lib/auth';
import { useWorkActions } from '../hooks/useWork';

const BILLED = ['Invoiced', 'Overdue', 'Part paid'];

/**
 * Delivered work with pricing, derived status and linked invoice. With `selection`, "To bill" rows
 * get a checkbox (for creating an invoice from several items).
 */
export function WorkTable({
  rows,
  loading,
  error,
  onRetry,
  showClient,
  selection,
  pagination,
  empty,
  onEdit
}: {
  rows: WorkView[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  showClient?: boolean;
  selection?: { selected: Set<string>; toggle: (w: WorkView, checked: boolean) => void };
  pagination?: PaginationState;
  empty?: ReactNode;
  onEdit: (w: WorkView) => void;
}) {
  const navigate = useNavigate();
  const canWrite = useCan('work.write');
  const canInvoice = useCan('invoices.write');
  const canPay = useCan('payments.record');
  const canSeeInvoices = useCan('invoices.read');
  const { remove, toggleBillable } = useWorkActions();
  const [deleting, setDeleting] = useState<WorkView | null>(null);

  const columns: Column<WorkView>[] = [
    ...(selection
      ? [
          {
            id: 'pick',
            header: <span className="sr-only">Select</span>,
            className: 'w-9',
            cell: (w: WorkView) =>
              w.status === 'To bill' ? (
                <input
                  type="checkbox"
                  className="size-4 accent-[hsl(var(--primary))]"
                  checked={selection.selected.has(w.id)}
                  onChange={e => selection.toggle(w, e.target.checked)}
                  aria-label={`Select ${w.title}`}
                />
              ) : null
          }
        ]
      : []),
    {
      id: 'title',
      header: 'Work delivered',
      wrap: true,
      cell: w => (
        <div>
          <div className="font-semibold">{w.title}</div>
          <div className="text-xs text-muted-foreground">
            {w.type}
            {w.releaseVersion && ` · release ${w.releaseVersion}`}
            {w.note && ` · ${w.note}`}
          </div>
        </div>
      )
    },
    {
      id: 'project',
      header: 'Project',
      cell: w => (
        <div>
          <Link to={`/projects/${w.projectId}`} className="hover:underline">
            {w.projectName}
          </Link>
          {showClient && <div className="text-xs text-muted-foreground">{w.clientName}</div>}
        </div>
      )
    },
    {
      id: 'delivered',
      header: 'Delivered',
      cell: w => <span className="text-muted-foreground">{formatDate(w.deliveredOn)}</span>
    },
    {
      id: 'pricing',
      header: 'Pricing',
      cell: w => (
        <span className="text-xs">
          {w.billing === 'Hourly'
            ? `${w.hours} h × ${formatInr(w.ratePaise)}`
            : w.billing === 'Free'
              ? 'Not billable'
              : 'Fixed price'}
        </span>
      )
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      cell: w =>
        w.billing === 'Free' ? (
          '—'
        ) : w.billablePaise ? (
          <span className="font-semibold">{formatInr(w.billablePaise)}</span>
        ) : (
          <span className="text-warn">add price</span>
        )
    },
    { id: 'status', header: 'Status', cell: w => <StatusBadge status={w.status} /> },
    {
      id: 'invoice',
      header: 'Invoice',
      cell: w =>
        w.invoiceNo ? (
          canSeeInvoices ? (
            <Link
              to={`/invoices/${w.invoiceNo}`}
              className="font-mono text-primary-soft-foreground hover:underline"
            >
              {w.invoiceNo}
            </Link>
          ) : (
            <span className="font-mono">{w.invoiceNo}</span>
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )
    },
    {
      id: 'menu',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: w => (
        <RowMenu label={`Actions for ${w.title}`}>
          {canWrite && (
            <DropdownMenuItem onSelect={() => onEdit(w)}>
              <Pencil /> {w.status === 'Needs price' ? 'Add price' : 'Edit'}
            </DropdownMenuItem>
          )}
          {canInvoice && w.status === 'To bill' && (
            <DropdownMenuItem onSelect={() => navigate(`/invoices/new?work=${w.id}`)}>
              <FilePlus2 /> Create invoice
            </DropdownMenuItem>
          )}
          {canSeeInvoices && w.invoiceNo && (
            <DropdownMenuItem onSelect={() => navigate(`/invoices/${w.invoiceNo}`)}>
              <FileText /> Open invoice
            </DropdownMenuItem>
          )}
          {canPay && BILLED.includes(w.status) && (
            <DropdownMenuItem onSelect={() => navigate(`/invoices/${w.invoiceNo}?pay=1`)}>
              <CreditCard /> Record payment
            </DropdownMenuItem>
          )}
          {canWrite && !w.invoiceNo && (
            <>
              <DropdownMenuItem onSelect={() => toggleBillable.mutate(w.id)}>
                <Check /> {w.billing === 'Free' ? 'Make billable' : 'Mark as not billable'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDeleting(w)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </RowMenu>
      )
    }
  ];

  return (
    <>
      <DataTable
        label="Delivered work"
        columns={columns}
        rows={rows}
        getRowId={w => w.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        pagination={pagination}
        empty={
          empty ?? (
            <EmptyState
              title="No delivered work"
              description="Log a fix or feature, or add a release to billing."
            />
          )
        }
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => !o && setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        description="It will no longer appear in Billable work. Invoices are not affected."
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => toast.success('Work item deleted'),
            onSettled: () => setDeleting(null)
          })
        }
      />
    </>
  );
}
