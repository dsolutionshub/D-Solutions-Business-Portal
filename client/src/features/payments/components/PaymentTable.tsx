import { formatDate, formatInr, type PaymentView } from '@dsol/shared';
import { Link } from 'react-router';
import { DataTable, type Column, type PaginationState } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';

/** Receipts recorded against invoices. */
export function PaymentTable({
  rows,
  loading,
  error,
  onRetry,
  pagination,
  onReceipt,
  showClient = true
}: {
  rows: PaymentView[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  pagination?: PaginationState;
  onReceipt: (id: string) => void;
  showClient?: boolean;
}) {
  const columns: Column<PaymentView>[] = [
    { id: 'receipt', header: 'Receipt', cell: p => <span className="font-mono">{p.receiptNo}</span> },
    {
      id: 'date',
      header: 'Date',
      cell: p => <span className="text-muted-foreground">{formatDate(p.paidOn)}</span>
    },
    {
      id: 'invoice',
      header: 'Invoice',
      cell: p => (
        <Link
          to={`/invoices/${p.invoiceNo}`}
          className="font-mono text-primary-soft-foreground hover:underline"
        >
          {p.invoiceNo}
        </Link>
      )
    },
    ...(showClient ? [{ id: 'client', header: 'Client', cell: (p: PaymentView) => p.clientName }] : []),
    { id: 'method', header: 'Method', cell: p => <StatusBadge status={p.method} tone="muted" dot={false} /> },
    { id: 'ref', header: 'Transaction ref.', cell: p => <span className="font-mono">{p.reference}</span> },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      cell: p => <span className="font-semibold">{formatInr(p.amountPaise)}</span>
    },
    {
      id: 'actions',
      header: <span className="sr-only">Receipt</span>,
      align: 'right',
      cell: p => (
        <Button size="sm" variant="outline" onClick={() => onReceipt(p.id)}>
          Receipt
        </Button>
      )
    }
  ];
  return (
    <DataTable
      label="Payments"
      columns={columns}
      rows={rows}
      getRowId={p => p.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      pagination={pagination}
      empty={<EmptyState title="No payments" description="Recorded payments will appear here." />}
    />
  );
}
