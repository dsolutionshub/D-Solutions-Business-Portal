/**
 * Daily at 02:30 UTC (08:00 IST), and on demand (POST /api/admin/run-cron, Admin):
 *
 *   1. Compute alerts for active clients and live projects.
 *   2. For alert types with the email channel on, pick the alerts that have reached a reminder
 *      interval (days before; days after the due date for overdue payments) not yet emailed, and
 *      send ONE digest per recipient with "alerts.digest": invoice types need invoice access, the rest the project sheets.
 *   3. If enabled in Settings, email clients about overdue invoices (same "days after" intervals).
 *   4. Send scheduled emails whose time has come.
 *   5. Record the run in cron_runs.
 *
 * Each alert is emailed once per reminder interval it reaches (reminder_log), so running twice
 * sends nothing new, and a date added late — or a day the job didn't run — still gets its
 * reminder. A digest that fails or hits the daily limit is retried on the next run.
 */
import {
  can,
  type Permission,
  ALERT_TYPES,
  formatDate,
  INVOICE_ALERT_TYPES,
  todayIn,
  type Alert,
  type CronRun,
  type CronRunCounts
} from '@dsol/shared';
import { and, desc, eq, ne } from 'drizzle-orm';
import { getDb, type Db } from '../db/client';
import { newId } from '../db/ids';
import { loadAlertSources } from '../db/repos/alerts';
import { purgeExpired } from '../db/repos/auth';
import { permissionsFor } from '../db/repos/roles';
import { getSettings } from '../db/repos/billing';
import { prefill, sendDueScheduled, sendEmail } from '../db/repos/emails';
import { cronRuns, reminderLog, users } from '../db/schema';
import type { Env } from '../env';
import { HttpError } from '../middleware/errors';
import { buildAlerts, reachedThresholds } from '../services/alerts';
import { escapeHtml } from '@dsol/shared';

export interface DailyOptions {
  trigger?: 'schedule' | 'manual';
  now?: Date;
}

export async function runDaily(env: Env, opts: DailyOptions = {}): Promise<CronRun> {
  const db = getDb(env);
  const now = opts.now ?? new Date();
  const s = await getSettings(db);
  const tz = s?.timezone ?? 'Asia/Kolkata';
  const today = todayIn(tz, now);
  const id = newId('cronRun');
  const startedAt = now.toISOString();
  const counts: CronRunCounts = {
    alerts: 0,
    digests: 0,
    digestItems: 0,
    clientReminders: 0,
    scheduledSent: 0,
    skippedAlreadySent: 0,
    blockedByLimit: 0
  };
  const errors: string[] = [];
  const [previous] = await db
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.trigger, 'schedule'))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);
  await db.insert(cronRuns).values({ id, runDate: today, trigger: opts.trigger ?? 'schedule', startedAt });

  // alerts with the reminder intervals they have reached
  let due: { alert: Alert; thresholds: number[] }[] = [];
  try {
    const sources = await loadAlertSources(db, today);
    const alerts = buildAlerts({ ...sources, channel: 'email' });
    counts.alerts = alerts.length;
    due = alerts
      .map(alert => ({ alert, thresholds: reachedThresholds(alert, sources.prefs) }))
      .filter(d => d.thresholds.length);
  } catch (err) {
    errors.push('Alerts: ' + message(err));
  }

  // 2. one digest per recipient
  if (due.length) {
    try {
      const people = await db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(ne(users.status, 'Deactivated'));
      // the digest goes to roles with "alerts.digest": invoice reminders need invoice access,
      // renewal reminders need the project sheets
      const permsByRole = new Map<string, Permission[]>();
      for (const role of new Set(people.map(p => p.role)))
        permsByRole.set(role, await permissionsFor(db, role));
      for (const u of people) {
        const who = { permissions: permsByRole.get(u.role) ?? [] };
        if (!can(who, 'alerts.digest')) continue;
        const recipient = `user:${u.id}`;
        const mine = due.filter(d =>
          INVOICE_ALERT_TYPES.includes(d.alert.type) ? can(who, 'invoices.read') : can(who, 'projects.sheet')
        );
        const fresh = await notYetReminded(db, recipient, mine);
        if (!fresh.length) {
          if (mine.length) counts.skippedAlreadySent++;
          continue;
        }
        const items = fresh.map(d => d.alert);
        try {
          const res = await sendEmail(
            db,
            env,
            {
              clientId: null,
              kind: 'digest',
              to: [u.email],
              toText: u.name,
              subject: `Reminders for ${formatDate(today)} — ${items.length} ${items.length === 1 ? 'item' : 'items'} due`,
              html: digestHtml(u.name, items, env.APP_URL),
              template: 'Daily digest',
              // same items, same day → the same email (guards against two runs at once)
              dedupeKey: `digest:${today}:${u.id}:${hash(items.map(a => a.id).join('|'))}`
            },
            null
          );
          if (!res) counts.skippedAlreadySent++;
          else if (res.status === 'Failed') errors.push(`Digest to ${u.email}: ${res.email.error}`);
          else {
            counts.digests++;
            counts.digestItems += items.length;
            await markReminded(db, recipient, fresh);
          }
        } catch (err) {
          if (err instanceof HttpError && err.status === 429) counts.blockedByLimit++;
          else errors.push(`Digest to ${u.email}: ${message(err)}`);
        }
      }
    } catch (err) {
      errors.push('Digests: ' + message(err));
    }
  }

  // 3. client-facing overdue reminders (off by default)
  if (s?.clientOverdueReminders)
    for (const d of due.filter(x => x.alert.type === 'Overdue payments')) {
      const invoiceNo = d.alert.id.split(':')[1]!;
      try {
        const p = await prefill(db, { for: 'reminder', invoice: invoiceNo });
        const recipient = `client:${p.clientId}`;
        if (!(await notYetReminded(db, recipient, [d])).length) continue;
        if (!p.to.length || p.missing.length || p.unknown.length) {
          errors.push(`Reminder for ${invoiceNo}: ${p.warning ?? 'the template has unfilled variables'}`);
          continue;
        }
        const res = await sendEmail(
          db,
          env,
          {
            clientId: p.clientId,
            kind: 'reminder',
            to: p.to,
            subject: p.subject,
            html: p.html,
            template: p.template,
            attachments: p.attachments,
            dedupeKey: `reminder:${invoiceNo}:${today}`
          },
          null
        );
        if (!res) counts.skippedAlreadySent++;
        else if (res.status !== 'Failed') {
          counts.clientReminders++;
          await markReminded(db, recipient, [d]);
        }
      } catch (err) {
        if (err instanceof HttpError && err.status === 429) counts.blockedByLimit++;
        else errors.push(`Reminder for ${invoiceNo}: ${message(err)}`);
      }
    }

  // expired sessions and old set/reset links
  await purgeExpired(db).catch(err => errors.push('Session clean-up: ' + message(err)));

  // 4. scheduled emails
  try {
    const r = await sendDueScheduled(db, env, now);
    counts.scheduledSent = r.sent;
    counts.blockedByLimit += r.blocked;
    if (r.failed) errors.push(`${r.failed} scheduled email(s) failed — see Email Center.`);
  } catch (err) {
    errors.push('Scheduled emails: ' + message(err));
  }

  const finishedAt = new Date().toISOString();
  await db.update(cronRuns).set({ finishedAt, counts, errors }).where(eq(cronRuns.id, id));
  if (errors.length)
    console.error(JSON.stringify({ level: 'error', msg: 'daily job finished with errors', errors }));

  // 6. tell the Admins if the job missed a day or had problems (once a day)
  const problems: string[] = [];
  if (opts.trigger !== 'manual' && previous && now.getTime() - Date.parse(previous.startedAt) > STALE_MS)
    problems.push(`The daily job did not run between ${previous.startedAt} and ${startedAt} (UTC).`);
  problems.push(...errors);
  if (problems.length)
    await alertAdmins(db, env, today, problems).catch(err =>
      console.error(JSON.stringify({ level: 'error', msg: 'owner alert failed', error: message(err) }))
    );
  return { id, runDate: today, trigger: opts.trigger ?? 'schedule', startedAt, finishedAt, counts, errors };
}

/** No scheduled run for this long = something is wrong (the job runs every 24 h). */
export const STALE_MS = 26 * 3_600_000;

/** For /api/health: is the scheduled daily job running and finishing cleanly? */
export async function dailyJobHealth(
  db: Db,
  now = Date.now()
): Promise<'ok' | 'stale' | 'failing' | 'never'> {
  const [last] = await db
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.trigger, 'schedule'))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);
  if (!last) return 'never';
  if (now - Date.parse(last.startedAt) > STALE_MS) return 'stale';
  if ((last.errors?.length ?? 0) > 0 || (!last.finishedAt && now - Date.parse(last.startedAt) > 3_600_000))
    return 'failing';
  return 'ok';
}

/** Email every active Admin about a problem with the daily job (at most once a day). */
async function alertAdmins(db: Db, env: Env, today: string, problems: string[]) {
  const owners = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.role, 'Admin'), ne(users.status, 'Deactivated')));
  if (!owners.length) return;
  await sendEmail(
    db,
    env,
    {
      clientId: null,
      kind: 'digest',
      to: owners.map(o => o.email),
      toText: owners.map(o => o.name).join(', '),
      subject: `Action needed: the portal's daily job had a problem (${formatDate(today)})`,
      html:
        `<p>The daily reminders job reported:</p><ul>${problems.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` +
        `<p>See Settings → Data in the portal, and the Worker logs in Cloudflare. docs/OPERATIONS.md explains what to check.</p>`,
      template: 'System alert',
      dedupeKey: `system-alert:${today}`
    },
    null
  );
}

/** The cron that runs the daily job (the other trigger only sends scheduled emails). */
export const DAILY_CRON = '30 2 * * *';

/** Every 15 minutes: send scheduled emails that are due. Not logged in cron_runs (too frequent). */
export async function runScheduledEmails(env: Env, now = new Date()) {
  const r = await sendDueScheduled(getDb(env), env, now);
  if (r.failed) console.error(`${r.failed} scheduled email(s) failed`);
  return r;
}

export async function recentCronRuns(db: Db, limit = 10): Promise<CronRun[]> {
  const rows = await db.select().from(cronRuns).orderBy(desc(cronRuns.startedAt)).limit(limit);
  return rows.map(r => ({
    ...r,
    counts: (r.counts as CronRunCounts | null) ?? null,
    errors: r.errors ?? []
  }));
}

type Due = { alert: Alert; thresholds: number[] };

/** Due alerts with at least one reached interval this recipient hasn't been emailed about. */
async function notYetReminded(db: Db, recipient: string, due: readonly Due[]): Promise<Due[]> {
  if (!due.length) return [];
  const sent = await db.select().from(reminderLog).where(eq(reminderLog.recipient, recipient));
  const done = new Set(sent.map(r => `${r.alertId}#${r.threshold}`));
  return due.filter(d => d.thresholds.some(t => !done.has(`${d.alert.id}#${t}`)));
}

async function markReminded(db: Db, recipient: string, due: readonly Due[]) {
  const rows = due.flatMap(d =>
    d.thresholds.map(threshold => ({ recipient, alertId: d.alert.id, threshold }))
  );
  // a few rows per statement: D1 allows 100 bound parameters
  for (let i = 0; i < rows.length; i += 25)
    await db
      .insert(reminderLog)
      .values(rows.slice(i, i + 25))
      .onConflictDoNothing();
}

/** Short, stable hash for dedupe keys (FNV-1a). */
const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The digest body: alerts grouped by type, each linking into the portal. */
function digestHtml(name: string, items: readonly Alert[], appUrl: string | undefined): string {
  const base = (appUrl ?? '').replace(/\/$/, '');
  const groups = ALERT_TYPES.map(t => [t, items.filter(a => a.type === t)] as const).filter(
    ([, list]) => list.length
  );
  return (
    `<p>Hi ${escapeHtml(name.split(' ')[0] ?? name)},</p><p>Here is what needs attention today.</p>` +
    groups
      .map(
        ([type, list]) =>
          `<p><b>${escapeHtml(type)}</b></p><ul>${list
            .map(
              a =>
                `<li>${base ? `<a href="${escapeHtml(base + a.href)}">${escapeHtml(a.title)}</a>` : escapeHtml(a.title)} — ${escapeHtml(a.body)}</li>`
            )
            .join('')}</ul>`
      )
      .join('') +
    `<p>Change which reminders you get in Notifications → Preferences.</p>`
  );
}
