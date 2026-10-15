/**
 * Email Center: send (now or scheduled), history, quota, templates, and ready-made emails for the
 * step-4 actions (issue & send an invoice, payment receipt, payment reminder, release email).
 *
 * Every email is stored first, then handed to Brevo, then updated with the outcome — so a failure
 * is visible in the history (status Failed + error) instead of being lost.
 */
import type { emailListQuerySchema } from '@dsol/shared';
import {
  DEFAULT_EMAIL_DAILY_LIMIT,
  formatDate,
  formatInr,
  releaseNotesHtml,
  renderTemplate,
  sanitizeEmailHtml,
  templateVariables,
  todayIn,
  type EmailAttachment,
  type EmailKind,
  type EmailListResponse,
  type EmailPrefill,
  type EmailPrefillQuery,
  type EmailQuota,
  type EmailRecipient,
  type EmailSendResult,
  type EmailTemplateCreate,
  type EmailTemplateUpdate,
  type EmailTemplateView,
  type EmailView,
  type TemplateValues
} from '@dsol/shared';
import type { z } from 'zod';
import { and, asc, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { AuthUser, Env } from '../../env';
import { badRequest, conflict, HttpError, notFound } from '../../middleware/errors';
import { deliver, emailLayout, isDevEmail, senderFrom } from '../../services/email';
import { signedLink } from '../../services/links';
import type { Db } from '../client';
import { newId } from '../ids';
import { clients, contacts, emails, emailTemplates, invoices, payments, releases, users } from '../schema';
import { getSettings, loadInvoices, loadPayments } from './billing';
import { getRelease } from './releases';
import { auditEntry, likePattern } from './util';
import { auditLog } from '../schema';

type EmailEnv = Pick<
  Env,
  'ENVIRONMENT' | 'BREVO_API_KEY' | 'EMAIL_FROM_NAME' | 'EMAIL_FROM_ADDRESS' | 'ENCRYPTION_KEY' | 'APP_URL'
>;

/** Statuses that used up Brevo quota (Logged (dev) counts too, so the guard can be tried locally). */
const COUNTED = ['Sent', 'Delivered', 'Logged (dev)'] as const;

/* ------------------------------------------------------------------ quota */

/** UTC instant of 00:00 on `date` in `timeZone` (e.g. 2026-10-13 IST → 2026-10-12T18:30:00Z). */
export function zonedMidnightUtc(date: string, timeZone: string): string {
  const guess = Date.parse(date + 'T00:00:00Z');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
      .formatToParts(new Date(guess))
      .map(p => [p.type, p.value])
  );
  const asLocal = Date.UTC(
    +parts.year!,
    +parts.month! - 1,
    +parts.day!,
    +parts.hour!,
    +parts.minute!,
    +parts.second!
  );
  return new Date(guess - (asLocal - guess)).toISOString();
}

export async function emailQuota(db: Db, env: EmailEnv, now = new Date()): Promise<EmailQuota> {
  const s = await getSettings(db);
  const tz = s?.timezone ?? 'Asia/Kolkata';
  const limit = s?.emailDailyLimit ?? DEFAULT_EMAIL_DAILY_LIMIT;
  const since = zonedMidnightUtc(todayIn(tz, now), tz);
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${emails.recipientCount}), 0)` })
    .from(emails)
    .where(and(inArray(emails.status, [...COUNTED]), gte(emails.sendAt, since)));
  const used = Number(row?.n ?? 0);
  return { used, limit, blocked: used >= limit, warning: used >= limit * 0.8, devMode: isDevEmail(env) };
}

const limitError = (q: EmailQuota) =>
  new HttpError(
    429,
    'daily_limit',
    `Daily email limit reached (${q.used} of ${q.limit} today). Sending resumes tomorrow — raise the limit in Settings if your Brevo plan allows more.`
  );

/* ------------------------------------------------------------------- send */

export interface SendInput {
  clientId: string | null;
  kind?: EmailKind;
  to: string[];
  cc?: string[];
  /** display text for the history; defaults to the addresses */
  toText?: string;
  subject: string;
  html: string;
  template?: string | null;
  scheduledAt?: string | null;
  attachments?: EmailAttachment[];
  releaseId?: string | null;
  dedupeKey?: string | null;
  /**
   * What the history keeps instead of the real body (account emails: their one-time links must
   * never be readable in the Email Center).
   */
  storedBody?: string;
}

/** Turn invoice / receipt "attachments" into signed links to their printable pages. */
async function attachmentLinks(
  db: Db,
  env: EmailEnv,
  list: readonly EmailAttachment[],
  clientId: string | null
) {
  const out: { label: string; url: string; invoiceId?: string; paymentId?: string }[] = [];
  for (const a of list) {
    if (a.kind === 'invoice') {
      const [v] = await db
        .select({ id: invoices.id, clientId: invoices.clientId, status: invoices.status })
        .from(invoices)
        .where(eq(invoices.number, a.invoiceNo));
      if (!v) throw badRequest(`Invoice ${a.invoiceNo} not found.`);
      if (clientId && v.clientId !== clientId)
        throw badRequest(`Invoice ${a.invoiceNo} belongs to another client.`);
      if (v.status === 'Draft') throw badRequest(`Issue ${a.invoiceNo} before emailing it.`);
      out.push({
        label: `View invoice ${a.invoiceNo}`,
        url: await signedLink(env, 'invoice', a.invoiceNo),
        invoiceId: v.id
      });
    } else {
      const [p] = await loadPayments(db, eq(payments.id, a.paymentId));
      if (!p) throw badRequest('Payment not found.');
      if (clientId && p.clientId !== clientId)
        throw badRequest(`Receipt ${p.receiptNo} belongs to another client.`);
      out.push({
        label: `View receipt ${p.receiptNo}`,
        url: await signedLink(env, 'receipt', p.id),
        paymentId: p.id
      });
    }
  }
  return out;
}

const recipientsText = async (db: Db, clientId: string | null, to: readonly string[]) => {
  if (!clientId) return to.join(', ');
  const rows = await db
    .select({ name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(eq(contacts.clientId, clientId));
  return to.map(addr => rows.find(r => r.email.toLowerCase() === addr)?.name ?? addr).join(', ');
};

/**
 * Store and send (or schedule) an email. Returns the stored email with its final status.
 * A dedupe key that already exists means "already sent" → null (the cron relies on this).
 */
export async function sendEmail(
  db: Db,
  env: EmailEnv,
  input: SendInput,
  user: AuthUser | null
): Promise<EmailSendResult | null> {
  const s = await getSettings(db);
  const to = [...new Set(input.to.map(a => a.toLowerCase()))];
  const cc = [...new Set((input.cc ?? []).map(a => a.toLowerCase()))].filter(a => !to.includes(a));
  if (input.clientId) {
    const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId));
    if (!c) throw badRequest('Client not found.');
  }
  if (input.releaseId) {
    const [r] = await db.select({ id: releases.id }).from(releases).where(eq(releases.id, input.releaseId));
    if (!r) throw badRequest('Release not found.');
  }
  const links = await attachmentLinks(db, env, input.attachments ?? [], input.clientId);
  const body = sanitizeEmailHtml(input.html);
  const html = emailLayout(body, links);
  const scheduled = !!input.scheduledAt;
  const recipientCount = to.length + cc.length;

  if (!scheduled) {
    const q = await emailQuota(db, env);
    if (q.used + recipientCount > q.limit) throw limitError(q);
  }

  const id = newId('email');
  const row = {
    id,
    clientId: input.clientId,
    kind: input.kind ?? 'client',
    toAddresses: to,
    ccAddresses: cc,
    toText: input.toText ?? (await recipientsText(db, input.clientId, to)),
    recipientCount,
    subject: input.subject.trim(),
    templateName: input.template ?? null,
    // the body as written (links are added when sending), so drafts/scheduled emails re-render
    bodyHtml: input.storedBody ?? body,
    status: scheduled ? ('Scheduled' as const) : ('Sent' as const),
    sendAt: scheduled ? input.scheduledAt! : new Date().toISOString(),
    releaseId: input.releaseId ?? null,
    invoiceId: links.find(l => l.invoiceId)?.invoiceId ?? null,
    paymentId: links.find(l => l.paymentId)?.paymentId ?? null,
    attachmentCount: links.length,
    dedupeKey: input.dedupeKey ?? null,
    sentBy: user?.id ?? null
  };
  // claim the row first: with a dedupe key, a second run can't insert (and so can't send) again
  const claimed = await db
    .insert(emails)
    .values({ ...row, status: scheduled ? 'Scheduled' : 'Draft' })
    .onConflictDoNothing({ target: emails.dedupeKey })
    .returning({ id: emails.id });
  if (!claimed.length) return null;

  if (scheduled) {
    if (input.releaseId)
      await db.update(releases).set({ mailStatus: 'Scheduled' }).where(eq(releases.id, input.releaseId));
  } else {
    const result = await deliver(env, senderFrom(env, s), { to, cc, subject: row.subject, html });
    await db
      .update(emails)
      .set({
        status: result.status,
        providerMessageId: result.messageId,
        error: result.error,
        sendAt: new Date().toISOString(),
        // a failed send frees its dedupe key, so the next run can try again
        ...(result.status === 'Failed' ? { dedupeKey: null } : {})
      })
      .where(eq(emails.id, id));
    if (input.releaseId && result.status !== 'Failed')
      await db.update(releases).set({ mailStatus: 'Sent' }).where(eq(releases.id, input.releaseId));
  }
  if (user)
    await db.insert(auditLog).values(
      auditEntry({
        userId: user.id,
        action: 'email.send',
        entity: 'email',
        entityId: id,
        meta: { kind: row.kind, recipients: recipientCount, scheduled }
      })
    );
  const email = await getEmail(db, id);
  return { email, status: email.status };
}

/** Send scheduled emails whose time has come (daily cron). Returns how many went out. */
export async function sendDueScheduled(
  db: Db,
  env: EmailEnv,
  now = new Date()
): Promise<{ sent: number; failed: number; blocked: number }> {
  const due = await db
    .select()
    .from(emails)
    .where(and(eq(emails.status, 'Scheduled'), lte(emails.sendAt, now.toISOString())))
    .orderBy(asc(emails.sendAt));
  const s = await getSettings(db);
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  for (const e of due) {
    const q = await emailQuota(db, env, now);
    if (q.used + e.recipientCount > q.limit) {
      blocked++;
      continue; // stays Scheduled; goes out on a later run
    }
    const links = await attachmentLinks(
      db,
      env,
      [
        ...(e.invoiceId ? await invoiceAttachment(db, e.invoiceId) : []),
        ...(e.paymentId ? [{ kind: 'receipt' as const, paymentId: e.paymentId }] : [])
      ],
      e.clientId
    ).catch(() => []);
    const result = await deliver(env, senderFrom(env, s), {
      to: e.toAddresses,
      cc: e.ccAddresses,
      subject: e.subject,
      html: emailLayout(e.bodyHtml ?? '', links)
    });
    await db
      .update(emails)
      .set({
        status: result.status,
        providerMessageId: result.messageId,
        error: result.error,
        sendAt: now.toISOString()
      })
      .where(eq(emails.id, e.id));
    if (e.releaseId && result.status !== 'Failed')
      await db.update(releases).set({ mailStatus: 'Sent' }).where(eq(releases.id, e.releaseId));
    if (result.status === 'Failed') failed++;
    else sent++;
  }
  return { sent, failed, blocked };
}

const invoiceAttachment = async (db: Db, invoiceId: string): Promise<EmailAttachment[]> => {
  const [v] = await db.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, invoiceId));
  return v ? [{ kind: 'invoice', invoiceNo: v.number }] : [];
};

/** Retry a failed email, or send a scheduled one now. */
export async function resendEmail(
  db: Db,
  env: EmailEnv,
  id: string,
  user: AuthUser
): Promise<EmailSendResult> {
  const [e] = await db.select().from(emails).where(eq(emails.id, id));
  if (!e) throw notFound('Email');
  if (e.status !== 'Failed' && e.status !== 'Scheduled')
    throw conflict('Only failed or scheduled emails can be sent again.');
  if (e.kind === 'account')
    throw conflict(
      'Sign-in links can’t be re-sent from the history. Send a new link from Team & Permissions.'
    );
  const q = await emailQuota(db, env);
  if (q.used + e.recipientCount > q.limit) throw limitError(q);
  const s = await getSettings(db);
  const links = await attachmentLinks(
    db,
    env,
    [
      ...(e.invoiceId ? await invoiceAttachment(db, e.invoiceId) : []),
      ...(e.paymentId ? [{ kind: 'receipt' as const, paymentId: e.paymentId }] : [])
    ],
    e.clientId
  );
  const result = await deliver(env, senderFrom(env, s), {
    to: e.toAddresses,
    cc: e.ccAddresses,
    subject: e.subject,
    html: emailLayout(e.bodyHtml ?? '', links)
  });
  await db
    .update(emails)
    .set({
      status: result.status,
      providerMessageId: result.messageId,
      error: result.error,
      sendAt: new Date().toISOString(),
      sentBy: user.id
    })
    .where(eq(emails.id, id));
  if (e.releaseId && result.status !== 'Failed')
    await db.update(releases).set({ mailStatus: 'Sent' }).where(eq(releases.id, e.releaseId));
  const email = await getEmail(db, id);
  return { email, status: email.status };
}

/** Cancel a scheduled email (it is kept as a Draft in the history). */
export async function cancelScheduled(db: Db, id: string) {
  const res = await db
    .update(emails)
    .set({ status: 'Draft' })
    .where(and(eq(emails.id, id), eq(emails.status, 'Scheduled')))
    .returning({ releaseId: emails.releaseId });
  if (!res.length) throw conflict('Only scheduled emails can be cancelled.');
  if (res[0]!.releaseId)
    await db
      .update(releases)
      .set({ mailStatus: 'Not sent' })
      .where(and(eq(releases.id, res[0]!.releaseId), eq(releases.mailStatus, 'Scheduled')));
}

/* ---------------------------------------------------------------- history */

const viewColumns = {
  email: emails,
  clientName: clients.name,
  sentByName: users.name,
  invoiceNo: invoices.number
};

const toView = (r: {
  email: typeof emails.$inferSelect;
  clientName: string | null;
  sentByName: string | null;
  invoiceNo: string | null;
}): EmailView => ({
  ...r.email,
  clientName: r.clientName,
  sentByName: r.sentByName,
  invoiceNo: r.invoiceNo
});

const baseQuery = (db: Db) =>
  db
    .select(viewColumns)
    .from(emails)
    .leftJoin(clients, eq(clients.id, emails.clientId))
    .leftJoin(users, eq(users.id, emails.sentBy))
    .leftJoin(invoices, eq(invoices.id, emails.invoiceId));

export async function getEmail(db: Db, id: string): Promise<EmailView> {
  const [r] = await baseQuery(db).where(eq(emails.id, id));
  if (!r) throw notFound('Email');
  return toView(r);
}

export async function listEmails(
  db: Db,
  q: z.output<typeof emailListQuerySchema>
): Promise<EmailListResponse> {
  const where: SQL[] = [];
  if (q.client) where.push(eq(emails.clientId, q.client));
  if (q.status) where.push(eq(emails.status, q.status));
  if (q.kind) where.push(eq(emails.kind, q.kind));
  if (q.template) where.push(eq(emails.templateName, q.template));
  if (q.q) {
    const p = likePattern(q.q);
    where.push(
      sql`(lower(${emails.subject}) LIKE ${p} ESCAPE '\\' OR lower(${emails.toText}) LIKE ${p} ESCAPE '\\')`
    );
  }
  const cond = where.length ? and(...where) : undefined;
  const [rows, [{ n }], stats] = await Promise.all([
    baseQuery(db)
      .where(cond)
      // scheduled (future) first, then newest
      .orderBy(desc(sql`${emails.status} = 'Scheduled'`), desc(emails.sendAt), desc(emails.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(emails).where(cond) as unknown as Promise<[{ n: number }]>,
    db.select({ status: emails.status, n: count() }).from(emails).groupBy(emails.status)
  ]);
  const by = Object.fromEntries(stats.map(s => [s.status, s.n])) as Record<string, number>;
  return {
    items: rows.map(toView),
    total: n,
    page: q.page,
    pageSize: q.pageSize,
    stats: {
      sent: (by.Sent ?? 0) + (by.Delivered ?? 0),
      scheduled: by.Scheduled ?? 0,
      failed: by.Failed ?? 0,
      logged: by['Logged (dev)'] ?? 0
    }
  };
}

/* -------------------------------------------------------------- templates */

const withVars = (t: typeof emailTemplates.$inferSelect): EmailTemplateView => ({
  ...t,
  variables: templateVariables(t.subject + ' ' + t.bodyHtml)
});

export async function listTemplates(db: Db): Promise<EmailTemplateView[]> {
  return (await db.select().from(emailTemplates).orderBy(asc(emailTemplates.name))).map(withVars);
}

async function templateByName(db: Db, name: string) {
  const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
  if (!t) throw badRequest(`The “${name}” template is missing. Add it in Email Center → Templates.`);
  return t;
}

export async function createTemplate(db: Db, input: EmailTemplateCreate): Promise<EmailTemplateView> {
  const [dup] = await db
    .select({ id: emailTemplates.id })
    .from(emailTemplates)
    .where(sql`lower(${emailTemplates.name}) = ${input.name.toLowerCase()}`);
  if (dup)
    throw conflict('A template with this name already exists.', {
      name: 'A template with this name already exists.'
    });
  const id = newId('emailTemplate');
  await db.insert(emailTemplates).values({ id, ...input, bodyHtml: sanitizeEmailHtml(input.bodyHtml) });
  const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
  return withVars(t!);
}

export async function updateTemplate(
  db: Db,
  id: string,
  input: EmailTemplateUpdate
): Promise<EmailTemplateView> {
  const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
  if (!t) throw notFound('Template');
  if (input.name && input.name.toLowerCase() !== t.name.toLowerCase()) {
    const [dup] = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(sql`lower(${emailTemplates.name}) = ${input.name.toLowerCase()}`);
    if (dup)
      throw conflict('A template with this name already exists.', {
        name: 'A template with this name already exists.'
      });
  }
  await db
    .update(emailTemplates)
    .set({ ...input, ...(input.bodyHtml ? { bodyHtml: sanitizeEmailHtml(input.bodyHtml) } : {}) })
    .where(eq(emailTemplates.id, id));
  const [next] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
  return withVars(next!);
}

/* ---------------------------------------------------------------- prefill */

async function clientContacts(db: Db, clientId: string): Promise<EmailRecipient[]> {
  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.clientId, clientId))
    .orderBy(asc(contacts.name));
  return rows.map(c => ({ name: c.name, email: c.email, tag: c.tag, notifyReleases: c.notifyReleases }));
}

/** Billing contacts, else the primary contact, else everyone. */
const billingRecipients = (list: EmailRecipient[]) => {
  const billing = list.filter(c => c.tag === 'Billing');
  if (billing.length) return billing;
  const primary = list.filter(c => c.tag === 'Primary');
  return primary.length ? primary : list.slice(0, 1);
};

const firstName = (name: string | undefined) => name?.trim().split(/\s+/)[0] ?? null;

/** A ready-to-edit email for a step-4 action. Nothing is sent. */
export async function prefill(db: Db, q: EmailPrefillQuery): Promise<EmailPrefill> {
  const s = await getSettings(db);
  const company = s?.company ?? 'D Solutions';
  let clientId: string;
  let clientName: string;
  let template: string;
  let pick: (list: EmailRecipient[]) => EmailRecipient[];
  let values: TemplateValues;
  let attachments: EmailAttachment[] = [];
  let releaseId: string | null = null;
  let warning: string | null = null;

  if (q.for === 'invoice' || q.for === 'reminder') {
    const [v] = await loadInvoices(db, eq(invoices.number, q.invoice));
    if (!v) throw notFound('Invoice');
    if (v.storedStatus === 'Draft') throw badRequest(`Issue ${v.number} before emailing it.`);
    if (v.storedStatus === 'Void') throw badRequest(`${v.number} is void.`);
    clientId = v.clientId;
    clientName = v.clientName;
    template = q.for === 'invoice' ? 'Invoice Notification' : 'Payment Reminder';
    pick = billingRecipients;
    values = {
      invoice_no: v.number,
      amount: formatInr(q.for === 'invoice' ? v.totalPaise : v.balancePaise),
      due_date: formatDate(v.dueDate),
      project: v.projectName
    };
    attachments = [{ kind: 'invoice', invoiceNo: v.number }];
    if (q.for === 'reminder' && v.balancePaise <= 0) warning = `${v.number} is already paid.`;
  } else if (q.for === 'receipt') {
    const [p] = await loadPayments(db, eq(payments.id, q.payment));
    if (!p) throw notFound('Payment');
    clientId = p.clientId;
    clientName = p.clientName;
    template = 'Payment Receipt';
    pick = billingRecipients;
    values = { invoice_no: p.invoiceNo, amount: formatInr(p.amountPaise), receipt_no: p.receiptNo };
    attachments = [{ kind: 'receipt', paymentId: p.id }];
  } else {
    const r = await getRelease(db, q.release);
    clientId = r.clientId;
    clientName = r.clientName;
    template = 'Software Release Announcement';
    pick = list => list.filter(c => c.notifyReleases);
    values = {
      project: r.projectName,
      version: r.version,
      release_notes: releaseNotesHtml(r.features, r.fixes)
    };
    releaseId = r.id;
  }

  const list = await clientContacts(db, clientId);
  const to = pick(list);
  if (q.for === 'release' && !to.length)
    warning = 'No contacts have release emails enabled — turn it on in the client’s Contacts tab.';
  else if (!to.length) warning = 'This client has no contacts yet. Add one in the client’s Contacts tab.';
  const t = await templateByName(db, template);
  const rendered = renderTemplate(t.subject, t.bodyHtml, {
    ...values,
    client_name: clientName,
    contact: firstName(to[0]?.name),
    company
  });
  return {
    clientId,
    clientName,
    contacts: list,
    to: to.map(c => c.email),
    cc: [],
    subject: rendered.subject,
    html: rendered.html,
    template,
    attachments,
    releaseId,
    missing: rendered.missing,
    unknown: rendered.unknown,
    warning
  };
}
