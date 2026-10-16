import { formatDate } from '@dsol/shared';
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  Check,
  ChevronDown,
  Download,
  Mail,
  MoreHorizontal,
  Pencil,
  Users
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BackButton } from '@/components/common/BackButton';
import { ClientLogo } from '@/components/common/ClientLogo';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { PageTabs } from '@/components/common/PageTabs';
import { StatCard, StatGrid } from '@/components/common/StatCard';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth';
import { clientsApi } from '../api';
import { ContactsTab } from '../components/ContactsTab';
import { EmailsTab } from '../components/EmailsTab';
import { InvoicesPaymentsTab } from '../components/InvoicesPaymentsTab';
import { OverviewTab } from '../components/OverviewTab';
import { ProjectsTab } from '../components/ProjectsTab';
import { useArchiveClient, useClient, useClientOptions, useRestoreClient } from '../hooks/useClients';

export function ClientDetailPage() {
  const { clientId = '' } = useParams();
  const navigate = useNavigate();
  const { data: c, isLoading, error, refetch } = useClient(clientId);
  const options = useClientOptions();
  const canWrite = useCan('clients.write');
  const canArchive = useCan('clients.archive');
  const canExport = useCan('clients.export');
  const canAddProject = useCan('projects.write');
  const canInvoices = useCan('invoices.read');
  const archive = useArchiveClient();
  const restore = useRestoreClient();
  const [confirmArchive, setConfirmArchive] = useState(false);

  const back = (
    <div>
      <BackButton to="/clients" label="Back to clients" />
    </div>
  );

  if (isLoading)
    return (
      <>
        {back}
        <Card className="flex gap-4 p-5" aria-busy>
          <Skeleton className="size-14 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </Card>
      </>
    );
  if (error || !c)
    return (
      <>
        {back}
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} />
        </Card>
      </>
    );

  const archived = !!c.archivedAt;
  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 items-center">
            <BackButton to="/clients" label="Back to clients" />
          </div>
          <ClientLogo name={c.name} color={c.color} logoUrl={c.logoUrl} size={56} wide />
          <div className="min-w-0 flex-[1_1_300px]">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight">{c.name}</h1>
              {archived ? <StatusBadge status="Archived" /> : <StatusBadge status={c.status} />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Switch client <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                  {(options.data ?? []).map(o => (
                    <DropdownMenuItem key={o.id} onSelect={() => navigate(`/clients/${o.id}`)}>
                      <ClientLogo name={o.name} color={o.color} logoUrl={o.logoUrl} size={22} />
                      <span className="flex-1">{o.name}</span>
                      {o.id === c.id && <Check />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-[18px] gap-y-1 text-sm text-subtle-foreground">
              {c.primaryContact && (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5" /> {c.primaryContact.name}
                    {c.primaryContact.role && ` · ${c.primaryContact.role}`}
                  </span>
                  <a
                    href={`mailto:${c.primaryContact.email}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <Mail className="size-3.5" /> {c.primaryContact.email}
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && !archived && (
              <Button asChild variant="outline">
                <Link to={`/clients/${c.id}/edit`}>
                  <Pencil /> Edit client
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MoreHorizontal /> More actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                {canAddProject && !archived && (
                  <DropdownMenuItem onSelect={() => navigate(`/projects/new?client=${c.id}`)}>
                    <Briefcase /> Add project
                  </DropdownMenuItem>
                )}
                {canExport && (
                  <DropdownMenuItem onSelect={() => void clientsApi.exportJson(c.id).catch(() => undefined)}>
                    <Download /> Export client data
                  </DropdownMenuItem>
                )}
                {canArchive && (
                  <>
                    <DropdownMenuSeparator />
                    {archived ? (
                      <DropdownMenuItem onSelect={() => restore.mutate(c.id)}>
                        <ArchiveRestore /> Restore client
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setConfirmArchive(true)}
                      >
                        <Archive /> Archive client
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {!canAddProject && !canExport && !canArchive && (
                  <DropdownMenuItem disabled>No actions for your role</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      {archived && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn"
        >
          <Archive className="size-4" />
          <span className="flex-1">
            Archived on {formatDate(c.archivedAt!.slice(0, 10))}. It is read-only and hidden from lists and
            pickers.
          </span>
          {canArchive && (
            <Button
              size="sm"
              variant="outline"
              disabled={restore.isPending}
              onClick={() => restore.mutate(c.id)}
            >
              Restore client
            </Button>
          )}
        </div>
      )}

      <StatGrid>
        <StatCard label="Projects" value={c.counts.projects} hint={`${c.counts.activeProjects} active`} />
        <StatCard label="Contacts" value={c.counts.contacts} hint="receive releases and invoices" />
        <StatCard label="Client since" value={formatDate(c.since)} />
      </StatGrid>

      <PageTabs
        defaultTab="overview"
        tabs={[
          { value: 'overview', label: 'Overview', content: <OverviewTab client={c} /> },
          {
            value: 'contacts',
            label: 'Contacts',
            count: c.counts.contacts,
            content: <ContactsTab client={c} />
          },
          {
            value: 'projects',
            label: 'Projects',
            count: c.counts.projects,
            content: <ProjectsTab client={c} />
          },
          ...(canInvoices
            ? [
                {
                  value: 'billing',
                  label: 'Invoices & payments',
                  content: <InvoicesPaymentsTab clientId={c.id} archived={!!c.archivedAt} />
                }
              ]
            : []),
          { value: 'emails', label: 'Emails', content: <EmailsTab clientId={c.id} /> }
        ]}
      />

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive ${c.name}?`}
        description="The client is hidden from lists and pickers, and reminders stop. Projects, invoices and history are kept, and you can restore it any time. Clients with unpaid invoices can't be archived."
        confirmLabel="Archive client"
        pending={archive.isPending}
        onConfirm={() => archive.mutate(c.id, { onSettled: () => setConfirmArchive(false) })}
      />
    </>
  );
}
