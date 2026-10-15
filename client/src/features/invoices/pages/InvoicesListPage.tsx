import { formatInr, INVOICE_STATUSES, type InvoiceStatus } from '@dsol/shared';
import { CreditCard, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { FilterBar } from '@/components/common/FilterBar';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { ReceiptDialog } from '@/features/payments/components/ReceiptDialog';
import { RecordPaymentDialog } from '@/features/payments/components/RecordPaymentDialog';
import { useCan } from '@/lib/auth';
import { useListParams } from '@/lib/useListParams';
import { cn } from '@/lib/utils';
import { InvoiceTable } from '../components/InvoiceTable';
import { useInvoices } from '../hooks/useInvoices';

const FILTERS = ['client', 'status'] as const;
const CHIPS: ('all' | InvoiceStatus)[] = ['all', ...INVOICE_STATUSES];

export function InvoicesListPage() {
  const params = useListParams({ sort: 'date:desc', filters: FILTERS });
  const status = (params.filters.status || 'all') as 'all' | InvoiceStatus;
  const { data, isLoading, isFetching, error, refetch } = useInvoices({
    q: params.query.q,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.query.sort,
    status,
    client: params.filters.client || undefined
  });
  const clients = useClientOptions();
  const canWrite = useCan('invoices.write');
  const canPay = useCan('payments.record');
  const [paying, setPaying] = useState<{ open: boolean; no?: string }>({ open: false });
  const [receipt, setReceipt] = useState<string | null>(null);
  const s = data?.summary;

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <>
            {canPay && (
              <Button variant="outline" onClick={() => setPaying({ open: true })}>
                <CreditCard /> Record payment
              </Button>
            )}
            {canWrite && (
              <Button asChild>
                <Link to="/invoices/new">
                  <Plus /> Create invoice
                </Link>
              </Button>
            )}
          </>
        }
      />
      <StatGrid>
        <StatCard
          label="Outstanding"
          value={s ? formatInr(s.outstandingPaise) : '—'}
          tone="primary"
          loading={isLoading}
          hint={s && `${s.openCount} open invoice(s)`}
        />
        <StatCard
          label="Overdue"
          value={s ? formatInr(s.overduePaise) : '—'}
          tone={s?.overdueCount ? 'bad' : 'default'}
          loading={isLoading}
          hint={s && `${s.overdueCount} invoice(s)`}
        />
        <StatCard
          label="Collected this month"
          value={s ? formatInr(s.collectedThisMonthPaise) : '—'}
          tone="ok"
          loading={isLoading}
          hint={s && `${s.collectedThisMonthCount} payment(s)`}
          to="/payments"
        />
        <StatCard label="Drafts" value={s?.drafts ?? '—'} loading={isLoading} hint="not yet issued" />
      </StatGrid>

      <Card>
        <FilterBar active={params.active} onClear={params.clear}>
          <SearchInput
            value={params.q}
            onChange={params.setQ}
            placeholder="Search invoice no., client or project"
          />
          <NativeSelect
            value={params.filters.client}
            onChange={e => params.setFilter('client', e.target.value)}
            aria-label="Client"
            className="w-[190px]"
          >
            <option value="">All clients</option>
            {(clients.data ?? []).map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </FilterBar>
        <div className="flex flex-wrap gap-2 border-b px-4 py-3" role="radiogroup" aria-label="Status">
          {CHIPS.map(v => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={status === v}
              onClick={() => params.setFilter('status', v === 'all' ? '' : v)}
              className={cn(
                'inline-flex h-[30px] items-center rounded-full border px-3 text-xs font-medium text-subtle-foreground',
                status === v && 'border-primary bg-primary-soft text-primary-soft-foreground'
              )}
            >
              {v === 'all' ? 'All' : v} · {data?.counts[v] ?? '…'}
            </button>
          ))}
        </div>
        <InvoiceTable
          rows={data?.items}
          loading={isLoading || isFetching}
          error={error}
          onRetry={refetch}
          sort={params.sort}
          onSortChange={params.setSort}
          onRecordPayment={no => setPaying({ open: true, no })}
          pagination={
            data && {
              page: data.page,
              pageSize: data.pageSize,
              total: data.total,
              onPageChange: params.setPage,
              onPageSizeChange: params.setPageSize
            }
          }
        />
        {data && (
          <div className="flex justify-end border-t px-4 py-2.5 text-xs text-muted-foreground">
            Balance due in view: <b className="ml-1 text-foreground">{formatInr(data.viewBalancePaise)}</b>
          </div>
        )}
      </Card>
      <RecordPaymentDialog
        open={paying.open}
        onOpenChange={o => setPaying(p => ({ ...p, open: o }))}
        invoiceNo={paying.no}
        onRecorded={setReceipt}
      />
      <ReceiptDialog paymentId={receipt} onOpenChange={o => !o && setReceipt(null)} />
    </>
  );
}
