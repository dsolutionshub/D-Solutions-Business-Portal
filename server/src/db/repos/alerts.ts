/**
 * Alerts for the bell, the Notifications inbox and the daily digest. Nothing about an alert is
 * stored except, per user, whether it was read or dismissed (alert_state).
 */
import {
  ALERT_TYPES,
  can,
  notificationPrefsSchema,
  todayIso,
  type Alert,
  type AlertListParams,
  type AlertListResponse,
  type IsoDate,
  type NoticeCreate,
  type NoticeView,
  type NotificationPrefs,
  type NotificationPrefsUpdate
} from '@dsol/shared';
import { and, desc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import type { AuthUser } from '../../env';
import { notFound } from '../../middleware/errors';
import { buildAlerts, type AlertInput } from '../../services/alerts';
import type { Db } from '../client';
import { newId } from '../ids';
import { alertState, clients, invoices, notices, settings, users } from '../schema';
import { getSettings, loadInvoices } from './billing';
import { loadRenewalItems } from './renewals';

export type AlertSources = Pick<
  AlertInput,
  'renewals' | 'invoices' | 'notices' | 'prefs' | 'clientNames' | 'today'
>;

export async function getPrefs(db: Db): Promise<NotificationPrefs> {
  const s = await getSettings(db);
  return notificationPrefsSchema.parse(s?.notificationPrefs ?? {});
}

/** Everything alerts are computed from — active clients and live projects only. */
export async function loadAlertSources(db: Db, today: IsoDate = todayIso()): Promise<AlertSources> {
  const [renewals, open, noticeRows, clientRows, prefs] = await Promise.all([
    loadRenewalItems(db, today),
    // issued, unpaid invoices of clients that aren't archived
    loadInvoices(db, and(eq(invoices.status, 'Sent'), isNull(clients.archivedAt)), today),
    db.select().from(notices).where(gte(notices.date, today)),
    db.select({ id: clients.id, name: clients.name }).from(clients),
    getPrefs(db)
  ]);
  return {
    renewals,
    invoices: open.map(v => ({
      number: v.number,
      clientId: v.clientId,
      dueDate: v.dueDate,
      status: v.status,
      balancePaise: v.balancePaise
    })),
    notices: noticeRows,
    prefs,
    clientNames: Object.fromEntries(clientRows.map(c => [c.id, c.name])),
    today
  };
}

/** What someone may see: invoice alerts need invoice access; without project sheets, costs but not domain names. */
export const roleScope = (who: { permissions: readonly string[] }) => ({
  includeInvoices: can(who, 'invoices.read'),
  costsOnly: !can(who, 'projects.sheet')
});

async function userState(db: Db, userId: string) {
  const rows = await db.select().from(alertState).where(eq(alertState.userId, userId));
  return {
    read: new Set(rows.filter(r => r.readAt).map(r => r.alertId)),
    dismissed: new Set(rows.filter(r => r.dismissedAt).map(r => r.alertId))
  };
}

/** This user's in-app alerts (the inbox and the bell). */
export async function alertsForUser(
  db: Db,
  user: AuthUser,
  q: AlertListParams = {}
): Promise<AlertListResponse> {
  const [sources, state] = await Promise.all([loadAlertSources(db), userState(db, user.id)]);
  const all = buildAlerts({
    ...sources,
    ...state,
    ...roleScope(user),
    channel: 'inApp',
    includeDismissed: true
  });
  const live = all.filter(a => !a.dismissed);
  const byType: AlertListResponse['byType'] = {};
  for (const a of live) byType[a.type] = (byType[a.type] ?? 0) + 1;

  let items: Alert[] = q.dismissed === '1' ? all : live;
  if (q.type) items = items.filter(a => a.type === q.type);
  if (q.state === 'unread') items = items.filter(a => !a.read);
  if (q.state === 'read') items = items.filter(a => a.read);
  if (q.limit) items = items.slice(0, q.limit);
  return {
    items,
    unread: live.filter(a => !a.read).length,
    total: live.length,
    dismissedCount: all.length - live.length,
    byType
  };
}

/** Mark one alert read / unread / dismissed for this user (an upsert on alert_state). */
export async function setAlertState(
  db: Db,
  userId: string,
  alertId: string,
  change: 'read' | 'unread' | 'dismiss'
) {
  const now = new Date().toISOString();
  const values = {
    readAt: change === 'unread' ? null : now,
    // dismissing also counts as read
    ...(change === 'dismiss' ? { dismissedAt: now } : {})
  };
  await db
    .insert(alertState)
    .values({ userId, alertId, readAt: values.readAt, dismissedAt: change === 'dismiss' ? now : null })
    .onConflictDoUpdate({
      target: [alertState.userId, alertState.alertId],
      set: { ...values, updatedAt: now }
    });
}

export async function markAllRead(db: Db, user: AuthUser): Promise<number> {
  const { items } = await alertsForUser(db, user, { state: 'unread' });
  const now = new Date().toISOString();
  for (const a of items)
    await db
      .insert(alertState)
      .values({ userId: user.id, alertId: a.id, readAt: now })
      .onConflictDoUpdate({
        target: [alertState.userId, alertState.alertId],
        set: { readAt: now, updatedAt: now }
      });
  return items.length;
}

export async function restoreDismissed(db: Db, userId: string): Promise<number> {
  const res = await db
    .update(alertState)
    .set({ dismissedAt: null })
    .where(and(eq(alertState.userId, userId), isNotNull(alertState.dismissedAt)))
    .returning({ id: alertState.alertId });
  return res.length;
}

/* ---------------------------------------------------------------- notices */

export async function listNotices(db: Db): Promise<NoticeView[]> {
  const rows = await db
    .select({ notice: notices, createdByName: users.name })
    .from(notices)
    .leftJoin(users, eq(users.id, notices.createdBy))
    .orderBy(desc(notices.date));
  return rows.map(r => ({ ...r.notice, createdByName: r.createdByName }));
}

export async function createNotice(db: Db, input: NoticeCreate, userId: string): Promise<NoticeView> {
  const id = newId('notice');
  await db.insert(notices).values({ id, ...input, createdBy: userId });
  return (await listNotices(db)).find(n => n.id === id)!;
}

export async function deleteNotice(db: Db, id: string) {
  const res = await db.delete(notices).where(eq(notices.id, id)).returning({ id: notices.id });
  if (!res.length) throw notFound('Notice');
}

/* ------------------------------------------------------------ preferences */

export async function updatePrefs(db: Db, patch: NotificationPrefsUpdate): Promise<NotificationPrefs> {
  const current = await getPrefs(db);
  const next = { ...current };
  for (const t of ALERT_TYPES) if (patch[t]) next[t] = patch[t]!;
  await db
    .update(settings)
    .set({ notificationPrefs: next, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` })
    .where(eq(settings.id, 1));
  return next;
}
