import { Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useTemplates } from '../api';

/** Shared header + tabs for the Email Center pages (each tab is its own route). */
export function EmailLayout({ children, stats }: { children: ReactNode; stats?: ReactNode }) {
  const canSend = useCan('emails.send');
  const templates = useTemplates().data;
  const tabs = [
    ...(canSend ? [{ to: '/email/compose', label: 'Compose', end: false }] : []),
    { to: '/email', label: 'Email history', end: true },
    { to: '/email/templates', label: `Templates${templates ? ` · ${templates.length}` : ''}`, end: false }
  ];
  return (
    <>
      <PageHeader
        title="Email Center"
        actions={
          canSend && (
            <Button asChild>
              <Link to="/email/compose">
                <Send /> Compose email
              </Link>
            </Button>
          )
        }
      />
      {stats}
      <Card>
        <nav
          className="flex gap-0.5 overflow-x-auto overflow-y-hidden border-b px-3"
          aria-label="Email Center"
        >
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  '-mb-px inline-flex h-[42px] items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-medium',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        {children}
      </Card>
    </>
  );
}
