import type { CronRun } from '@dsol/shared';
import { Download, Loader2, Play } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/lib/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEmailQuota } from '@/features/email/api';
import { settingsApi, useCronRuns } from '../api';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata'
  });

function Row({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3.5 last:border-b-0">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  );
}

const summary = (r: CronRun) =>
  r.counts
    ? [
        `${r.counts.alerts} alerts`,
        `${r.counts.digests} digest(s) (${r.counts.digestItems} items)`,
        r.counts.clientReminders ? `${r.counts.clientReminders} client reminder(s)` : null,
        r.counts.scheduledSent ? `${r.counts.scheduledSent} scheduled sent` : null,
        r.counts.skippedAlreadySent ? `${r.counts.skippedAlreadySent} already sent today` : null,
        r.counts.blockedByLimit ? `${r.counts.blockedByLimit} held by the daily limit` : null
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Running…';

/** Settings → Data: export everything (secrets hidden), run the daily reminders now. */
export function DataTab() {
  const canExport = useCan('data.export');
  const canSeeRuns = useCan('cron.read');
  const canRun = useCan('cron.run');
  const runs = useCronRuns(canSeeRuns);
  const quota = useEmailQuota().data;
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = useMutation({
    mutationFn: settingsApi.runCron,
    onSuccess: r => {
      toast.success(`Daily reminders ran — ${summary(r)}`);
      return Promise.all(['cron-runs', 'emails', 'alerts'].map(k => qc.invalidateQueries({ queryKey: [k] })));
    }
  });

  const exportAll = async () => {
    setExporting(true);
    try {
      await settingsApi.exportAll();
      toast.success('Data exported — secrets hidden');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-3xl px-5 py-2">
      <Row
        title="Export all data"
        hint="Download clients, projects, invoices and more as JSON (secrets are never included)"
      >
        <Button
          variant="outline"
          size="sm"
          disabled={!canExport || exporting}
          title={canExport ? undefined : 'Your role can’t export data'}
          onClick={() => void exportAll()}
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export
        </Button>
      </Row>
      <Row
        title="Emails sent today"
        hint={
          quota?.devMode
            ? 'Development mode: emails are logged, not sent.'
            : 'Recipients against the daily limit (Brevo’s free plan allows 300 a day). Change the limit in Company & invoicing.'
        }
      >
        <span
          role={quota?.warning ? 'alert' : undefined}
          className={
            quota?.blocked
              ? 'font-semibold text-bad'
              : quota?.warning
                ? 'font-semibold text-warn'
                : 'font-semibold'
          }
        >
          {quota
            ? `${quota.used} / ${quota.limit}${quota.blocked ? ' — limit reached, sending resumes tomorrow' : quota.warning ? ' — close to the limit' : ''}`
            : '…'}
        </span>
      </Row>
      <Row
        title="Daily reminders"
        hint="Runs every day at 8:00 AM IST: one digest email per person, optional client reminders, scheduled emails. Running it again the same day sends nothing new."
      >
        {canRun ? (
          <Button size="sm" disabled={run.isPending} onClick={() => setConfirm(true)}>
            {run.isPending ? <Loader2 className="animate-spin" /> : <Play />} Run now
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Admin only</span>
        )}
      </Row>
      {canSeeRuns && (
        <div className="py-3.5">
          <div className="mb-2 text-[13px] font-semibold">Recent runs</div>
          {runs.isLoading ? (
            <Skeleton className="h-20" />
          ) : runs.data?.length ? (
            <ul className="divide-y rounded-lg border text-[13px]">
              {runs.data.map(r => (
                <li key={r.id} className="px-3 py-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">
                      {when(r.startedAt)} · {r.trigger === 'manual' ? 'run by hand' : 'scheduled'}
                    </span>
                    {r.errors.length ? (
                      <span className="text-bad">{r.errors.length} problem(s)</span>
                    ) : (
                      <span className="text-ok">OK</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{summary(r)}</div>
                  {r.errors.map((e, i) => (
                    <div key={i} className="text-xs text-bad">
                      {e}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">No runs yet.</p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Run the daily reminders now?"
        description="Digest emails go to everyone whose role has “Daily reminder email”, for today’s reminder days. If they already went out today, nothing is sent again."
        confirmLabel="Run now"
        destructive={false}
        pending={run.isPending}
        onConfirm={() => run.mutate(undefined, { onSettled: () => setConfirm(false) })}
      />
    </div>
  );
}
