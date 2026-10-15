import { formatDate, type ClientView } from '@dsol/shared';
import { Link } from 'react-router';
import { UrlLink } from '@/components/common/UrlLink';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/format';
import { useCan } from '@/lib/auth';

function Box({
  title,
  action,
  children
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

/** Business details, primary contact and internal notes. Project details live on each project page. */
export function OverviewTab({ client: c }: { client: ClientView }) {
  const canWrite = useCan('clients.write') && !c.archivedAt;
  const address = [c.addr1, c.addr2, c.city, [c.state, c.pin].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const social = (
    [
      ['Instagram', c.instagram],
      ['Facebook', c.facebook],
      ['YouTube', c.youtube],
      ['Other', c.socialOther]
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => !!r[1]);
  const rows: [string, React.ReactNode][] = [
    ['Business type', c.type ?? '—'],
    ['Industry', c.industry ?? '—'],
    ['Client since', formatDate(c.since)],
    ['Address', address],
    ['GSTIN', c.gstin ?? '—'],
    [
      'About',
      <span key="a" className="text-subtle-foreground">
        {c.description ?? '—'}
      </span>
    ]
  ];
  return (
    <div className="flex flex-wrap items-start gap-4 p-5">
      <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
        <Box
          title="Business details"
          action={
            canWrite && (
              <Button asChild size="sm" variant="outline">
                <Link to={`/clients/${c.id}/edit`}>Edit</Link>
              </Button>
            )
          }
        >
          <dl className="grid grid-cols-[minmax(110px,160px)_1fr] gap-x-4 gap-y-2.5 text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </Box>
      </div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
        <Box title="Primary contact">
          {c.primaryContact ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-subtle-foreground">
                  {initials(c.primaryContact.name)}
                </span>
                <div>
                  <div className="font-semibold">{c.primaryContact.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.primaryContact.role ?? 'Primary contact'}
                  </div>
                </div>
              </div>
              <div className="text-sm">
                <a
                  href={`mailto:${c.primaryContact.email}`}
                  className="text-primary-soft-foreground hover:underline"
                >
                  {c.primaryContact.email}
                </a>
                {c.primaryContact.phone && (
                  <div className="text-subtle-foreground">{c.primaryContact.phone}</div>
                )}
                {c.primaryContact.altPhone && (
                  <div className="text-subtle-foreground">{c.primaryContact.altPhone}</div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No primary contact.</p>
          )}
        </Box>
        <Box title="Social media">
          {social.length ? (
            <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-[13px]">
              {social.map(([k, href]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate">
                    <UrlLink href={href} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No social media pages.</p>
          )}
        </Box>
        <Box title="Internal notes">
          <p className="whitespace-pre-line text-sm leading-relaxed text-subtle-foreground">
            {c.notes || 'No notes yet.'}
          </p>
        </Box>
      </div>
    </div>
  );
}
