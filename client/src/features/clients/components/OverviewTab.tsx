import { formatDate, type ClientView } from '@dsol/shared';
import {
  Building2,
  CalendarDays,
  Facebook,
  Info,
  Instagram,
  Link2,
  Mail,
  MapPin,
  Phone,
  Receipt,
  Tag,
  UserRound,
  Youtube,
  type LucideIcon
} from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
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

/** An icon, a small label and the value. */
function Item({
  icon: Icon,
  label,
  children,
  wide
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
  /** span both columns */
  wide?: boolean;
}) {
  return (
    <li className={wide ? 'flex items-start gap-3 sm:col-span-2' : 'flex items-start gap-3'}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-soft-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words text-[13px]">{children}</div>
      </div>
    </li>
  );
}

const linkClass = 'text-primary-soft-foreground hover:underline';
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** Business details, primary contact, social media and internal notes. */
export function OverviewTab({ client: c }: { client: ClientView }) {
  const canWrite = useCan('clients.write') && !c.archivedAt;
  const address = [c.addr1, c.addr2, c.city, [c.state, c.pin].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const social = (
    [
      [Instagram, 'Instagram', c.instagram],
      [Facebook, 'Facebook', c.facebook],
      [Youtube, 'YouTube', c.youtube],
      [Link2, 'Other', c.socialOther]
    ] as [LucideIcon, string, string | null][]
  ).filter((r): r is [LucideIcon, string, string] => !!r[2]);
  const p = c.primaryContact;

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
          <ul className="grid gap-4 sm:grid-cols-2">
            <Item icon={Building2} label="Business type">
              {c.type ?? '—'}
            </Item>
            <Item icon={Tag} label="Industry">
              {c.industry ?? '—'}
            </Item>
            <Item icon={CalendarDays} label="Client since">
              {formatDate(c.since)}
            </Item>
            <Item icon={Receipt} label="GST number">
              <span className="font-mono">{c.gstin ?? '—'}</span>
            </Item>
            <Item icon={MapPin} label="Address" wide>
              {address || '—'}
            </Item>
            <Item icon={Info} label="About" wide>
              <span className="text-subtle-foreground">{c.description ?? '—'}</span>
            </Item>
          </ul>
        </Box>
      </div>

      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
        <Box title="Primary contact">
          {p ? (
            <ul className="grid gap-3">
              <Item icon={UserRound} label="Name">
                <span className="font-semibold">{p.name}</span>
                {p.role && <span className="text-muted-foreground"> · {p.role}</span>}
              </Item>
              <Item icon={Mail} label="Email">
                <a href={`mailto:${p.email}`} className={linkClass}>
                  {p.email}
                </a>
              </Item>
              {p.phone && (
                <Item icon={Phone} label="Phone">
                  <a href={`tel:${p.phone.replace(/\s/g, '')}`} className={linkClass}>
                    {p.phone}
                  </a>
                </Item>
              )}
              {p.altPhone && (
                <Item icon={Phone} label="Alternative phone">
                  <a href={`tel:${p.altPhone.replace(/\s/g, '')}`} className={linkClass}>
                    {p.altPhone}
                  </a>
                </Item>
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No primary contact.</p>
          )}
        </Box>

        <Box title="Social media">
          {social.length ? (
            <ul className="grid gap-3">
              {social.map(([icon, label, href]) => (
                <Item key={label} icon={icon} label={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {shortUrl(href)}
                  </a>
                </Item>
              ))}
            </ul>
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
