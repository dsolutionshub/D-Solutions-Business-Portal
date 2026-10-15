import {
  formatInr,
  monthLabel,
  REPORT_RANGES,
  type ReportKey,
  type ReportRange,
  type Reports
} from '@dsol/shared';
import { Download, Table2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from 'recharts';
import { toast } from 'sonner';
import { useTheme } from '@/app/theme/useTheme';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { NativeSelect } from '@/components/common/NativeSelect';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClientOptions } from '@/features/clients/hooks/useClients';
import { cn } from '@/lib/utils';
import { reportsApi, useReports } from '../api';

const RANGE_LABEL: Record<ReportRange, string> = {
  '6M': 'Last 6 months',
  YTD: 'FY to date',
  '12M': 'Last 12 months'
};

/** ₹ in short form for axes: ₹950, ₹12K, ₹4.5L, ₹1.2Cr. */
const short = (paise: number) => {
  const r = paise / 100;
  if (r >= 1e7) return `₹${+(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${+(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${+(r / 1e3).toFixed(0)}K`;
  return `₹${Math.round(r)}`;
};

/** Theme colours read from CSS variables (SVG attributes can't use var() reliably). */
function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [c, setC] = useState({ s1: '#2a78d6', s2: '#eb6834', grid: '#e5e7eb', ink: '#6b7280' });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string) => cs.getPropertyValue(n).trim();
    setC({
      s1: v('--series-1'),
      s2: v('--series-2'),
      grid: `hsl(${v('--border')})`,
      ink: `hsl(${v('--muted-foreground')})`
    });
  }, [resolvedTheme]);
  return c;
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const range = (REPORT_RANGES as readonly string[]).includes(params.get('range') ?? '')
    ? (params.get('range') as ReportRange)
    : '6M';
  const client = params.get('client') ?? '';
  const set = (k: string, v: string) =>
    setParams(
      p => {
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true }
    );
  const q = useReports(range, client || undefined);
  const clients = useClientOptions();
  const r = q.data;

  const csv = (key: ReportKey) =>
    reportsApi
      .csv(key, range, client || undefined)
      .catch(err => toast.error(err instanceof Error ? err.message : 'Export failed.'));

  return (
    <>
      <PageHeader title="Reports" />
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Range" className="inline-flex gap-0.5 rounded-lg bg-muted p-[3px]">
          {(['6M', 'YTD', '12M'] as const).map(v => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={range === v}
              onClick={() => set('range', v === '6M' ? '' : v)}
              className={cn(
                'h-8 rounded-md px-3 text-xs font-medium text-subtle-foreground',
                range === v && 'bg-card text-foreground shadow-sm'
              )}
            >
              {RANGE_LABEL[v]}
            </button>
          ))}
        </div>
        <NativeSelect
          value={client}
          onChange={e => set('client', e.target.value)}
          aria-label="Client"
          className="w-[200px]"
        >
          <option value="">All clients</option>
          {(clients.data ?? []).map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        {r && (
          <span className="text-xs text-muted-foreground">
            {r.from} – {r.to}
          </span>
        )}
      </div>

      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <StatGrid>
            <StatCard
              label="Invoiced"
              value={r ? formatInr(r.totals.invoicedPaise) : '—'}
              loading={!r}
              hint={r && RANGE_LABEL[range]}
            />
            <StatCard
              label="Collected"
              value={r ? formatInr(r.totals.collectedPaise) : '—'}
              tone="ok"
              loading={!r}
              hint={r && RANGE_LABEL[range]}
            />
            <StatCard
              label="Outstanding"
              value={r ? formatInr(r.totals.outstandingPaise) : '—'}
              tone="primary"
              loading={!r}
              hint="open balances today"
              to="/invoices"
            />
            <StatCard
              label="Unbilled work"
              value={r ? formatInr(r.unbilled.toBillPaise) : '—'}
              loading={!r}
              hint={r && `${r.unbilled.toBillCount} to bill · ${r.unbilled.needsPriceCount} need a price`}
              to="/work"
            />
          </StatGrid>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))]">
            <MonthlyCard r={r} onCsv={() => csv('monthly')} />
            <AgeingCard r={r} onCsv={() => csv('ageing')} />
            <ClientsCard r={r} onCsv={() => csv('clients')} />
            <WorkTypesCard r={r} onCsv={() => csv('workTypes')} />
            <RunningCostsCard r={r} onCsv={() => csv('runningCosts')} />
            <RenewalsCard r={r} onCsv={() => csv('renewals')} />
            <UnbilledCard r={r} onCsv={() => csv('unbilled')} />
          </div>
        </>
      )}
    </>
  );
}

/** A report card: title, subtitle, CSV button, and a chart ⇄ table toggle. */
function ReportCard({
  title,
  subtitle,
  onCsv,
  loading,
  empty,
  chart,
  table
}: {
  title: string;
  subtitle: string;
  onCsv: () => void;
  loading: boolean;
  empty?: string | false;
  chart: ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={asTable}
            onClick={() => setAsTable(t => !t)}
            title={asTable ? 'Show chart' : 'Show as table'}
          >
            <Table2 /> {asTable ? 'Chart' : 'Table'}
          </Button>
          <Button size="sm" variant="outline" onClick={onCsv}>
            <Download /> CSV
          </Button>
        </div>
      </div>
      <div className="flex-1 p-4">
        {loading ? (
          <Skeleton className="h-[260px]" />
        ) : empty ? (
          <EmptyState title="No data" description={empty} />
        ) : asTable ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {table.head.map((h, i) => (
                    <th key={h} className={cn('py-2 font-medium', i > 0 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {row.map((cell, j) => (
                      <td key={j} className={cn('py-2', j > 0 && 'text-right tabular-nums')}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-[260px]">{chart}</div>
        )}
      </div>
    </Card>
  );
}

/** Tooltip in the app's own styles (works in both themes). */
function ChartTooltip({
  active,
  payload,
  label,
  labelFormat
}: TooltipProps<number, string> & { labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-semibold">{labelFormat ? labelFormat(String(label)) : label}</div>
      {payload.map(p => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{formatInr(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = (ink: string) => ({ tick: { fill: ink, fontSize: 11 }, tickLine: false, axisLine: false });

function MonthlyCard({ r, onCsv }: { r?: Reports; onCsv: () => void }) {
  const c = useChartColors();
  const data = r?.monthly ?? [];
  return (
    <ReportCard
      title="Revenue vs collection"
      subtitle="Invoiced (issued invoices) and collected, by month"
      onCsv={onCsv}
      loading={!r}
      empty={
        r && !data.some(m => m.invoicedPaise || m.collectedPaise) && 'No invoices or payments in this range.'
      }
      table={{
        head: ['Month', 'Invoiced', 'Collected'],
        rows: data.map(m => [monthLabel(m.month), formatInr(m.invoicedPaise), formatInr(m.collectedPaise)])
      }}
      chart={
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="month" tickFormatter={m => monthLabel(m).split(' ')[0]!} {...axisProps(c.ink)} />
            <YAxis tickFormatter={short} width={56} {...axisProps(c.ink)} />
            <Tooltip content={<ChartTooltip labelFormat={monthLabel} />} cursor={{ stroke: c.grid }} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: c.ink }} />
            <Line
              type="monotone"
              dataKey="invoicedPaise"
              name="Invoiced"
              stroke={c.s1}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="collectedPaise"
              name="Collected"
              stroke={c.s2}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      }
    />
  );
}

/** One-series bar chart (vertical bars, or horizontal for long names). */
function Bars({
  data,
  x,
  y,
  name,
  horizontal
}: {
  data: object[];
  x: string;
  y: string;
  name: string;
  horizontal?: boolean;
}) {
  const c = useChartColors();
  return (
    <ResponsiveContainer>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={c.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={short} {...axisProps(c.ink)} />
          <YAxis
            type="category"
            dataKey={x}
            width={150}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={({ x: tx, y: ty, payload }: { x: number; y: number; payload: { value: string } }) => (
              <text x={tx} y={ty} dy={4} textAnchor="end" fill={c.ink} fontSize={11}>
                <title>{payload.value}</title>
                {payload.value.length > 22 ? payload.value.slice(0, 21) + '…' : payload.value}
              </text>
            )}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Bar dataKey={y} name={name} fill={c.s1} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey={x} {...axisProps(c.ink)} />
          <YAxis tickFormatter={short} width={56} {...axisProps(c.ink)} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Bar dataKey={y} name={name} fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function AgeingCard({ r, onCsv }: { r?: Reports; onCsv: () => void }) {
  const data = r?.ageing ?? [];
  return (
    <ReportCard
      title="Receivables ageing"
      subtitle="Open balances today, by days since the invoice date"
      onCsv={onCsv}
      loading={!r}
      empty={r && !data.some(a => a.balancePaise) && 'Nothing outstanding.'}
      table={{
        head: ['Age', 'Invoices', 'Open balance'],
        rows: data.map(a => [a.bucket, a.count, formatInr(a.balancePaise)])
      }}
      chart={<Bars data={data} x="bucket" y="balancePaise" name="Open balance" />}
    />
  );
}

function ClientsCard({ r, onCsv }: { r?: Reports; onCsv: () => void }) {
  const data = (r?.clients ?? []).filter(c => c.invoicedPaise > 0).slice(0, 10);
  return (
    <ReportCard
      title="Revenue by client"
      subtitle="Invoiced in the range (top 10)"
      onCsv={onCsv}
      loading={!r}
      empty={r && !data.length && 'No invoices for this filter.'}
      table={{
        head: ['Client', 'Invoiced', 'Collected'],
        rows: (r?.clients ?? []).map(c => [
          c.clientName,
          formatInr(c.invoicedPaise),
          formatInr(c.collectedPaise)
        ])
      }}
      chart={<Bars data={data} x="clientName" y="invoicedPaise" name="Invoiced" horizontal />}
    />
  );
}

function WorkTypesCard({ r, onCsv }: { r?: Reports; onCsv: () => void }) {
  const data = r?.workTypes ?? [];
  return (
    <ReportCard
      title="Billed work by type"
      subtitle="Delivered work on invoices issued in the range"
      onCsv={onCsv}
      loading={!r}
      empty={r && !data.some(w => w.billedPaise) && 'No delivered work was billed in this range.'}
      table={{
        head: ['Type', 'Items', 'Billed'],
        rows: data.map(w => [w.type, w.count, formatInr(w.billedPaise)])
      }}
      chart={<Bars data={data} x="type" y="billedPaise" name="Billed" />}
    />
  );
}

function RunningCostsCard({ r, onCsv }: { r?: Reports; onCsv: () => void }) {
  const data = (r?.runningCosts ?? []).slice(0, 8);
  return (
    <ReportCard
      title="Project running costs"
      subtitle={`Domain, SSL, hosting and subscriptions per year (top 8) · total ${r ? formatInr(r.totals.runningCostsPaise) : '—'}`}
      onCsv={onCsv}
      loading={!r}
      empty={r && !data.length && 'No tracked costs.'}
      table={{
        head: ['Project', 'Client', 'Per year'],
        rows: (r?.runningCosts ?? []).map(p => [p.projectName, p.clientName, formatInr(p.yearlyPaise)])
      }}
      chart={<Bars data={data} x="projectName" y="yearlyPaise" name="Per year" horizontal />}
    />
  );
}

function RenewalsCard({ r, onCsv }: { r?: Reports; onCsv: () => void }) {
  const data = (r?.renewals ?? []).map(m => ({ ...m, label: monthLabel(m.month) }));
  const items = data.reduce((a, m) => a + m.count, 0);
  return (
    <ReportCard
      title="Upcoming renewals"
      subtitle={`Next 90 days by month · ${items} item${items === 1 ? '' : 's'}`}
      onCsv={onCsv}
      loading={!r}
      empty={r && !data.length && 'Nothing is due in the next 90 days.'}
      table={{
        head: ['Month', 'Items', 'Amount'],
        rows: data.map(m => [m.label, m.count, formatInr(m.amountPaise)])
      }}
      chart={<Bars data={data} x="label" y="amountPaise" name="Amount due" />}
    />
  );
}

function UnbilledCard({ r, onCsv }: { r?: Reports; onCsv: () => void }) {
  const u = r?.unbilled;
  return (
    <Card className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-5 py-3.5">
        <div>
          <h2 className="text-[15px] font-semibold">Unbilled work</h2>
          <p className="text-xs text-muted-foreground">Delivered but not invoiced yet</p>
        </div>
        <Button size="sm" variant="outline" onClick={onCsv}>
          <Download /> CSV
        </Button>
      </div>
      {!u ? (
        <Skeleton className="m-4 h-32" />
      ) : (
        <dl className="grid flex-1 grid-cols-2 gap-4 p-5">
          <div>
            <dt className="text-xs text-muted-foreground">Ready to invoice</dt>
            <dd className="text-[26px] font-semibold tabular-nums">{formatInr(u.toBillPaise)}</dd>
            <dd className="text-xs text-muted-foreground">{u.toBillCount} item(s)</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">On draft invoices</dt>
            <dd className="text-[26px] font-semibold tabular-nums">{formatInr(u.inDraftPaise)}</dd>
            <dd className="text-xs text-muted-foreground">not issued yet</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Needs a price</dt>
            <dd className="font-semibold">{u.needsPriceCount} item(s) delivered without a price</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}
