import { formatInr } from '@dsol/shared';
import { CreditCard, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { FilterBar } from '@/components/common/FilterBar';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { useCan } from '@/lib/auth';
import { useListParams } from '@/lib/useListParams';
import { paymentsApi } from '../api';
import { PaymentTable } from '../components/PaymentTable';
import { ReceiptDialog } from '../components/ReceiptDialog';
import { RecordPaymentDialog } from '../components/RecordPaymentDialog';
import { usePayments } from '../hooks/usePayments';

const FILTERS = ['client', 'from', 'to'] as const;

export function PaymentsPage() {
  const params = useListParams({ sort: 'date:desc', filters: FILTERS });
  const query = {
    q: params.query.q,
    page: params.page,
    pageSize: params.pageSize,
    client: params.filters.client || undefined,
    from: params.filters.from || undefined,
    to: params.filters.to || undefined
  };
  const { data, isLoading, isFetching, error, refetch } = usePayments(query);
  const clients = useClientOptions();
  const canPay = useCan('payments.record');
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const badRange = !!query.from && !!query.to && query.from > query.to;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await paymentsApi.exportCsv({ ...query, page: undefined, pageSize: undefined });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        actions={
          <>
            <Button variant="outline" disabled={exporting || !data?.total} onClick={() => void exportCsv()}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
            </Button>
            {canPay && (
              <Button onClick={() => setPaying(true)}>
                <CreditCard /> Record payment
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-0 flex-[3_1_560px]">
          <FilterBar active={params.active} onClear={params.clear}>
            <SearchInput
              value={params.q}
              onChange={params.setQ}
              placeholder="Search receipt, invoice, client or reference"
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
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              From
              <Input
                type="date"
                className="w-[150px]"
                value={params.filters.from}
                onChange={e => params.setFilter('from', e.target.value)}
                aria-invalid={badRange || undefined}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              To
              <Input
                type="date"
                className="w-[150px]"
                value={params.filters.to}
                onChange={e => params.setFilter('to', e.target.value)}
                aria-invalid={badRange || undefined}
              />
            </label>
          </FilterBar>
          {badRange && (
            <p role="alert" className="px-5 py-2 text-xs text-destructive">
              “From” is after “To”.
            </p>
          )}
          <PaymentTable
            rows={badRange ? [] : data?.items}
            loading={isLoading || isFetching}
            error={error}
            onRetry={refetch}
            onReceipt={setReceipt}
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
              Total received in view: <b className="ml-1 text-foreground">{formatInr(data.totalPaise)}</b>
            </div>
          )}
        </Card>
        <Card className="min-w-0 flex-[1_1_260px] p-5">
          <h2 className="mb-2 text-[15px] font-semibold">Outstanding by client</h2>
          {!data ? (
            <Skeleton className="h-32" />
          ) : data.outstanding.length ? (
            <ul className="divide-y text-[13px]">
              {data.outstanding.map(o => (
                <li key={o.clientId} className="flex items-center justify-between gap-2 py-2.5">
                  <Link
                    to={`/invoices?client=${o.clientId}`}
                    className="truncate font-semibold hover:underline"
                  >
                    {o.clientName}
                  </Link>
                  <span className={o.overdue ? 'font-semibold text-bad' : 'font-semibold'}>
                    {formatInr(o.balancePaise)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Nothing outstanding. 🎉</p>
          )}
        </Card>
      </div>
      <RecordPaymentDialog
        open={paying}
        onOpenChange={setPaying}
        clientId={params.filters.client || undefined}
        onRecorded={setReceipt}
      />
      <ReceiptDialog paymentId={receipt} onOpenChange={o => !o && setReceipt(null)} />
    </>
  );
}
