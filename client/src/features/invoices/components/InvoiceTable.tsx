import { formatDate, formatInr, type InvoiceListItem } from '@dsol/shared';
import { Bell, Copy, CreditCard, Eye, Mail, Pencil, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column, type PaginationState } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { RowMenu } from '@/components/common/RowMenu';
import { StatusBadge } from '@/components/common/StatusBadge';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import type { SortState } from '@/lib/useListParams';
import { SendEmailDialog } from '@/features/email/components/SendEmailDialog';
import { useCan } from '@/lib/auth';
import { invoicesApi } from '../api';
import { useInvoiceActions } from '../hooks/useInvoices';

/** Invoices with derived status and balance, and the row menu (view, edit draft, pay, PDF, duplicate, void). */
export function InvoiceTable({
  rows,
  loading,
  error,
  onRetry,
  showClient = true,
  sort,
  onSortChange,
  pagination,
  onRecordPayment
}: {
  rows: InvoiceListItem[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  showClient?: boolean;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  pagination?: PaginationState;
  onRecordPayment: (no: string) => void;
}) {
  const navigate = useNavigate();
  const canWrite = useCan('invoices.write');
  const canVoid = useCan('invoices.void');
  const canPay = useCan('payments.record');
  const actions = useInvoiceActions();
  const [voiding, setVoiding] = useState<InvoiceListItem | null>(null);
  const [mailing, setMailing] = useState<{ for: 'invoice' | 'reminder'; invoice: string } | null>(null);
  const canEmail = useCan('emails.send');
  const open = (v: InvoiceListItem) => v.balancePaise > 0 && v.storedStatus === 'Sent';

  const columns: Column<InvoiceListItem>[] = [
    {
      id: 'number',
      header: 'Invoice',
      sortable: true,
      cell: v => (
        <Link
          to={`/invoices/${v.number}`}
          className="font-mono font-semibold text-primary-soft-foreground hover:underline"
        >
          {v.number}
        </Link>
      )
    },
    ...(showClient
      ? [
          {
            id: 'client',
            header: 'Client',
            sortable: true,
            cell: (v: InvoiceListItem) => <span className="font-semibold">{v.clientName}</span>
          }
        ]
      : []),
    {
      id: 'project',
      header: 'Project',
      cell: v => <span className="text-muted-foreground">{v.projectName ?? '—'}</span>
    },
    {
      id: 'date',
      header: 'Invoice date',
      sortable: true,
      cell: v => <span className="text-muted-foreground">{formatDate(v.issueDate)}</span>
    },
    {
      id: 'due',
      header: 'Due date',
      sortable: true,
      cell: v => <span className={v.status === 'Overdue' ? 'text-bad' : ''}>{formatDate(v.dueDate)}</span>
    },
    { id: 'total', header: 'Total', align: 'right', cell: v => formatInr(v.totalPaise) },
    {
      id: 'paid',
      header: 'Paid',
      align: 'right',
      cell: v => <span className="text-muted-foreground">{v.paidPaise ? formatInr(v.paidPaise) : '—'}</span>
    },
    {
      id: 'balance',
      header: 'Balance due',
      align: 'right',
      sortable: true,
      cell: v => (
        <span className="font-semibold">{v.status === 'Void' ? '—' : formatInr(v.balancePaise)}</span>
      )
    },
    { id: 'status', header: 'Status', cell: v => <StatusBadge status={v.status} /> },
    {
      id: 'menu',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: v => (
        <RowMenu label={`Actions for ${v.number}`}>
          <DropdownMenuItem asChild>
            <Link to={`/invoices/${v.number}`}>
              <Eye /> View invoice
            </Link>
          </DropdownMenuItem>
          {canWrite && v.storedStatus === 'Draft' && (
            <DropdownMenuItem onSelect={() => navigate(`/invoices/${v.number}/edit`)}>
              <Pencil /> Edit draft
            </DropdownMenuItem>
          )}
          {canPay && (
            <DropdownMenuItem disabled={!open(v)} onSelect={() => onRecordPayment(v.number)}>
              <CreditCard /> Record payment
            </DropdownMenuItem>
          )}
          {canEmail && (
            <>
              <DropdownMenuItem
                disabled={v.storedStatus !== 'Sent'}
                onSelect={() => setMailing({ for: 'invoice', invoice: v.number })}
              >
                <Mail /> Email invoice
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!open(v)}
                onSelect={() => setMailing({ for: 'reminder', invoice: v.number })}
              >
                <Bell /> Send payment reminder
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem asChild>
            <a href={invoicesApi.pdfUrl(v.number)} target="_blank" rel="noopener noreferrer">
              <Printer /> Download PDF
            </a>
          </DropdownMenuItem>
          {canWrite && (
            <DropdownMenuItem
              onSelect={() =>
                actions.duplicate.mutate(v.number, { onSuccess: d => navigate(`/invoices/${d.number}`) })
              }
            >
              <Copy /> Duplicate
            </DropdownMenuItem>
          )}
          {canVoid && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                disabled={v.paidPaise > 0 || v.status === 'Void'}
                onSelect={() => setVoiding(v)}
              >
                <Trash2 /> Void invoice
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
        label="Invoices"
        columns={columns}
        rows={rows}
        getRowId={v => v.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        sort={sort}
        onSortChange={onSortChange}
        pagination={pagination}
        empty={<EmptyState title="No invoices" description="Nothing matches this view." />}
      />
      <ConfirmDialog
        open={!!voiding}
        onOpenChange={o => !o && setVoiding(null)}
        title={`Void ${voiding?.number}?`}
        description="The invoice stays on record as Void for audit and can no longer be paid or edited. Its delivered work goes back to “To bill”. This cannot be undone."
        confirmLabel="Void invoice"
        pending={actions.void.isPending}
        onConfirm={() =>
          voiding && actions.void.mutate(voiding.number, { onSettled: () => setVoiding(null) })
        }
      />
      <SendEmailDialog request={mailing} onOpenChange={o => !o && setMailing(null)} />
    </>
  );
}
