import {
  COST_SHEET_FIELDS,
  formatDate,
  formatInr,
  SHEET_SECTIONS,
  type ProjectView,
  type SecretFieldKey,
  type SheetFieldDef
} from '@dsol/shared';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { CopyButton } from '@/components/common/CopyButton';
import { DateWithDaysLeft } from '@/components/common/DateWithDaysLeft';
import { EnvBadge } from '@/components/common/EnvBadge';
import { SecretField } from '@/components/common/SecretField';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Tile } from '@/components/common/Tile';
import { UrlLink } from '@/components/common/UrlLink';
import { RenewalsPanel } from './RenewalsPanel';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { revealer } from '../hooks/useProjects';

/** Fields that look like identifiers are shown in monospace. */
const MONO = /Id$|^host$|^user$|^ip$|^port$|^pixel$|^ga4$|^account$|^name$/;
/** Dates that are due dates (coloured by days left). */
const DUE = ['expiry', 'sslExpiry', 'nextBill'];

function SheetValue({ section, field, value }: { section: string; field: SheetFieldDef; value: unknown }) {
  if (value === null || value === undefined || value === '')
    return <span className="text-muted-foreground">—</span>;
  if (field.type === 'money') return <>{formatInr(value as number)}</>;
  if (field.type === 'date')
    return DUE.includes(field.key) ? (
      <DateWithDaysLeft iso={value as string} inline />
    ) : (
      <>{formatDate(value as string)}</>
    );
  const text = String(value);
  return (
    <span className="flex min-w-0 items-center justify-between gap-1">
      {field.type === 'url' ? (
        <UrlLink href={text} />
      ) : (
        <span
          className={cn(
            'min-w-0 break-words',
            MONO.test(field.key) && section !== 'domain' && 'font-mono text-[12.5px]'
          )}
        >
          {text}
        </span>
      )}
      {field.type !== 'select' && <CopyButton value={text} label={field.label} />}
    </span>
  );
}

function SheetCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border">
      <h2 className="border-b px-4 py-3 text-[15px] font-semibold">{title}</h2>
      <dl className="grid grid-cols-[minmax(120px,190px)_1fr] items-center gap-x-4 gap-y-2.5 px-4 py-3 text-[13px] max-sm:grid-cols-1 max-sm:gap-y-1">
        {children}
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground max-sm:mt-1.5">{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </>
  );
}

/** The project sheet: summary tiles, one card per section, secrets via reveal, running cost, notes. */
export function DetailsTab({ view: v }: { view: ProjectView }) {
  const canReveal = useCan('secrets.reveal');
  const reveal = revealer(v.project.id);
  const { sheet, project: p } = v;
  /** Accounts: cost amounts and due dates only (the server has already blanked everything else). */
  const costsOnly = v.access === 'costs';
  const sections = costsOnly
    ? SHEET_SECTIONS.filter(s => COST_SHEET_FIELDS[s.key]).map(s => ({
        ...s,
        fields: s.fields.filter(f => COST_SHEET_FIELDS[s.key]!.includes(f.key))
      }))
    : SHEET_SECTIONS;
  const monthly = (cycle: string | null) => (cycle === 'Yearly' ? 'year' : 'month');

  const costRows: [string, number, string][] = [
    ['Domain renewal', sheet.domain.renewal ?? sheet.domain.cost ?? 0, 'Yearly'],
    ['SSL certificate', sheet.domain.sslCost ?? 0, 'Yearly'],
    [`Hosting — ${sheet.hosting.platform ?? '—'}`, sheet.hosting.cost ?? 0, sheet.hosting.cycle ?? 'Monthly'],
    ...v.costs.map(
      c =>
        [c.name + (c.nextDue ? ` (due ${formatDate(c.nextDue)})` : ''), c.amountPaise, c.cycle] as [
          string,
          number,
          string
        ]
    )
  ];

  return (
    <div className="flex flex-col gap-4 p-5">
      {costsOnly && (
        <div
          role="note"
          className="flex items-center gap-2 rounded-lg bg-info-bg px-3.5 py-2.5 text-sm text-info"
        >
          <Lock className="size-4 flex-none" />
          Costs and due dates only — URLs, logins, keys and database details aren’t shown for your role.
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Tile label="Running cost / year">
          {formatInr(v.annualCostPaise)}
          <div className="text-xs font-normal text-muted-foreground">
            ≈ {formatInr(v.annualCostPaise / 12)} / month
          </div>
        </Tile>
        <Tile label="Domain expiry">
          <DateWithDaysLeft iso={sheet.domain.expiry} />
        </Tile>
        <Tile label="Hosting next bill">
          <DateWithDaysLeft iso={sheet.hosting.nextBill} />
        </Tile>
        {costsOnly ? (
          <Tile label="Hosting platform">{sheet.hosting.platform ?? '—'}</Tile>
        ) : (
          <>
            <Tile label="Production">
              <UrlLink href={sheet.links.prod} />
            </Tile>
            <Tile label="Hosting · Database">
              {sheet.hosting.platform ?? '—'} · {sheet.db.engine ?? '—'}
            </Tile>
          </>
        )}
      </div>

      <RenewalsPanel projectId={p.id} clientName={v.client.name} archived={!!p.archivedAt} />

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))]">
        <SheetCard title="Project basics">
          <Row label="Client">{v.client.name}</Row>
          <Row label="Type">{p.type ?? '—'}</Row>
          <Row label="Status">
            <StatusBadge status={p.status} />
          </Row>
          <Row label="Start date">{formatDate(p.startDate)}</Row>
          <Row label="Environments">
            <span className="flex flex-wrap gap-1">
              {p.environments.map(e => (
                <EnvBadge key={e} env={e} />
              ))}
            </span>
          </Row>
        </SheetCard>

        {sections.map(s => (
          <SheetCard key={s.key} title={s.title}>
            {s.fields.map(f => {
              const key = `${s.key}.${f.key}` as SecretFieldKey;
              return (
                <Row key={f.key} label={f.label}>
                  {f.type === 'secret' ? (
                    <SecretField
                      hasValue={v.secrets[key]?.set ?? false}
                      reveal={canReveal ? reveal(key) : undefined}
                      label={f.label}
                    />
                  ) : (
                    <SheetValue
                      section={s.key}
                      field={f}
                      value={(sheet[s.key] as Record<string, unknown>)[f.key]}
                    />
                  )}
                </Row>
              );
            })}
          </SheetCard>
        ))}

        {!costsOnly && (
          <SheetCard title="Other keys">
            {v.extraKeys.length ? (
              v.extraKeys.map(k => (
                <Row key={k.id} label={k.label}>
                  {k.isSecret ? (
                    <SecretField
                      hasValue={k.hasValue}
                      reveal={canReveal ? reveal(`extra:${k.id}`) : undefined}
                      label={k.label}
                    />
                  ) : k.value ? (
                    <span className="flex items-center justify-between gap-1">
                      <span className="min-w-0 break-all font-mono text-[12.5px]">{k.value}</span>
                      <CopyButton value={k.value} label={k.label} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Row>
              ))
            ) : (
              <Row label={<span>None added</span>}>{null}</Row>
            )}
          </SheetCard>
        )}

        <SheetCard title="Running cost">
          {costRows.map(([label, amount, cycle]) => (
            <Row key={label} label={label}>
              <span className="flex flex-wrap justify-between gap-2">
                <span>
                  {formatInr(amount)} / {monthly(cycle)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatInr(amount * (cycle === 'Monthly' ? 12 : 1))} / yr
                </span>
              </span>
            </Row>
          ))}
          <Row label={<span className="font-semibold text-foreground">Total per year</span>}>
            <span className="text-[15px] font-semibold">
              {formatInr(v.annualCostPaise)}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ≈ {formatInr(v.annualCostPaise / 12)} / month
              </span>
            </span>
          </Row>
        </SheetCard>

        {!costsOnly && (
          <section className="min-w-0 rounded-xl border px-4 py-3">
            <h2 className="mb-2 text-[15px] font-semibold">Notes</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-subtle-foreground">
              {sheet.notes || 'No notes yet.'}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
