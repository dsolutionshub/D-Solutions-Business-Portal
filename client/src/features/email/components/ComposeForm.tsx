import {
  addDays,
  htmlToText,
  renderTemplate,
  todayIso,
  unresolvedVariables,
  type EmailSendResult
} from '@dsol/shared';
import { AlertTriangle, Clock, Eye, Link2, Loader2, Send, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Field } from '@/components/common/Field';
import { NativeSelect } from '@/components/common/NativeSelect';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useClientOptions, useContacts } from '@/features/clients/hooks/useClients';
import { ApiError } from '@/lib/api';
import { useSettings } from '@/lib/lookups';
import { cn } from '@/lib/utils';
import { useEmailQuota, useSendEmail, useTemplates } from '../api';
import { attachmentLabel, type ComposeInitial } from '../compose';
import { EmailPreview } from './EmailPreview';
import { RichTextEditor } from './RichTextEditor';

/** Hand-filled [placeholders] from the prototype's templates. */
const BRACKET = /\[(date|time window|domain|amount|invoice no\.|due date|Your announcement)\]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const firstName = (n?: string) => n?.trim().split(/\s+/)[0];

/**
 * Compose an email to a client's contacts: template, recipients, CC, subject, rich-text body,
 * invoice/receipt links, preview, send now or schedule. Used by the Compose page and by the
 * prefilled "Email invoice / receipt / reminder / release" dialogs.
 */
export function ComposeForm({
  initial,
  lockClient,
  onSent,
  onCancel,
  submitLabel = 'Send now',
  templateToApply
}: {
  initial: ComposeInitial;
  /** apply this template once templates have loaded ("Use template") */
  templateToApply?: string | null;
  lockClient?: boolean;
  onSent: (r: EmailSendResult) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const settings = useSettings();
  const clients = useClientOptions();
  const templates = useTemplates();
  const quota = useEmailQuota();
  const send = useSendEmail();
  const [v, setV] = useState(initial);
  const [ccText, setCcText] = useState(initial.cc.join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const contacts = useContacts(v.clientId);

  useEffect(() => {
    setV(initial);
    setCcText(initial.cc.join(', '));
  }, [initial]);

  const clientName = clients.data?.find(c => c.id === v.clientId)?.name ?? '';
  const company = settings.data?.company ?? 'D Solutions';
  const from = settings.data
    ? `${settings.data.emailFromName || settings.data.emailDefaults.name} <${settings.data.emailFromAddress || settings.data.emailDefaults.address}>`
    : '…';
  const cc = useMemo(
    () =>
      ccText
        .split(/[,;\s]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean),
    [ccText]
  );
  const left = unresolvedVariables(v.subject, v.html);
  const bracket = BRACKET.test(v.subject + v.html);
  const recipientCount = v.to.length + cc.length;

  const applyTemplate = (name: string) => {
    const t = templates.data?.find(x => x.name === name);
    if (!t) return setV(s => ({ ...s, template: null }));
    const first = contacts.data?.find(c => v.to.includes(c.email.toLowerCase()));
    const r = renderTemplate(t.subject, t.bodyHtml, {
      client_name: clientName || null,
      contact: firstName(first?.name) ?? null,
      company
    });
    setV(s => ({ ...s, template: t.name, subject: r.subject, html: r.html }));
  };

  useEffect(() => {
    if (templateToApply && templates.data) applyTemplate(templateToApply);
  }, [templateToApply, templates.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTemplate = (name: string) => {
    if (name && htmlToText(v.html)) setPendingTemplate(name);
    else if (name) applyTemplate(name);
    else setV(s => ({ ...s, template: null }));
  };

  const onClient = (clientId: string) => {
    setV(s => ({ ...s, clientId, to: [], attachments: s.attachments.filter(() => false) }));
  };

  // a new client: select its Primary contact(s)
  useEffect(() => {
    if (!contacts.data || v.to.length) return;
    const primary = contacts.data.filter(c => c.tag === 'Primary').map(c => c.email.toLowerCase());
    if (primary.length && v.clientId !== initial.clientId) setV(s => ({ ...s, to: primary }));
  }, [contacts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (email: string) =>
    setV(s => ({ ...s, to: s.to.includes(email) ? s.to.filter(x => x !== email) : [...s.to, email] }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!v.clientId) e.clientId = 'Select a client.';
    if (!v.to.length) e.to = 'Choose at least one recipient.';
    const badCc = cc.filter(x => !EMAIL_RE.test(x));
    if (badCc.length) e.cc = `Not an email address: ${badCc.join(', ')}`;
    if (!v.subject.trim()) e.subject = 'Subject is required.';
    if (!htmlToText(v.html)) e.html = 'Message body is empty.';
    else if (left.length)
      e.html = `Fill in or remove ${left.map(n => `{{${n}}}`).join(', ')} before sending.`;
    else if (bracket) e.html = 'Replace the [placeholders] in the template before sending.';
    setErrors(e);
    if (Object.keys(e).length)
      toast.error(
        e.to && Object.keys(e).length === 1
          ? 'Choose at least one recipient'
          : 'Please fix the highlighted fields.'
      );
    return !Object.keys(e).length;
  };

  const submit = async (scheduledAt: string | null) => {
    try {
      const r = await send.mutateAsync({
        clientId: v.clientId,
        to: v.to,
        cc,
        subject: v.subject.trim(),
        html: v.html,
        template: v.template,
        attachments: v.attachments,
        releaseId: v.releaseId,
        scheduledAt
      });
      if (r.status === 'Failed')
        toast.error(
          `Email not sent: ${r.email.error ?? 'Brevo refused it.'} It is saved in the history — retry from there.`
        );
      else if (r.status === 'Scheduled')
        toast.success(
          `Email scheduled for ${new Date(scheduledAt!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })} IST`
        );
      else if (r.status === 'Logged (dev)')
        toast.success(`Email logged (dev mode, not sent) for ${recipientCount} recipient(s)`);
      else toast.success(`Email sent to ${recipientCount} recipient(s)`);
      onSent(r);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setErrors(
          Object.fromEntries(
            Object.entries(err.fields).map(([k, m]) => [k === 'scheduledAt' ? 'html' : k, m])
          )
        );
        toast.error('Please fix the highlighted fields.');
      } else toast.error(err instanceof Error ? err.message : 'Could not send the email.');
      quota.refetch();
    }
  };

  const q = quota.data;
  return (
    <div className="grid gap-4">
      {q?.devMode && (
        <p className="rounded-lg bg-purple-bg px-3 py-2 text-xs text-purple">
          Development mode: no Brevo key is set, so emails are logged on the server, not sent.
        </p>
      )}
      {q && (q.blocked || q.used + recipientCount > q.limit) ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">
          <AlertTriangle className="size-4" /> Daily email limit reached ({q.used} of {q.limit}). Sending
          resumes tomorrow; you can still schedule.
        </p>
      ) : q?.warning ? (
        <p className="flex items-center gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          <AlertTriangle className="size-4" /> {q.used} of {q.limit} emails used today.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" required error={errors.clientId}>
          <NativeSelect value={v.clientId} disabled={lockClient} onChange={e => onClient(e.target.value)}>
            <option value="">Select a client</option>
            {(clients.data ?? []).map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {v.clientId && !clients.data?.some(c => c.id === v.clientId) && (
              <option value={v.clientId}>{clientName || 'Current client'}</option>
            )}
          </NativeSelect>
        </Field>
        <Field label="Email template">
          <NativeSelect value={v.template ?? ''} onChange={e => onTemplate(e.target.value)}>
            <option value="">Blank email</option>
            {(templates.data ?? []).map(t => (
              <option key={t.id}>{t.name}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label="Recipients" required error={errors.to}>
        <div role="group" className="flex flex-wrap gap-1.5">
          {!v.clientId ? (
            <span className="text-sm text-muted-foreground">Select a client to choose contacts.</span>
          ) : contacts.isLoading ? (
            <span className="text-sm text-muted-foreground">Loading contacts…</span>
          ) : contacts.data?.length ? (
            contacts.data.map(c => {
              const on = v.to.includes(c.email.toLowerCase());
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  title={c.email}
                  onClick={() => toggle(c.email.toLowerCase())}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium',
                    on
                      ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                      : 'text-subtle-foreground'
                  )}
                >
                  {c.name} <span className="text-muted-foreground">· {c.tag}</span>
                </button>
              );
            })
          ) : (
            <span className="text-sm text-muted-foreground">
              This client has no contacts yet. Add one in the client’s Contacts tab.
            </span>
          )}
        </div>
      </Field>

      <Field label="CC" hint="Other addresses, separated by commas" error={errors.cc}>
        <Input
          value={ccText}
          onChange={e => setCcText(e.target.value)}
          placeholder="e.g. accounts@yourcompany.com"
        />
      </Field>
      <Field label="Subject" required error={errors.subject}>
        <Input
          value={v.subject}
          onChange={e => setV(s => ({ ...s, subject: e.target.value }))}
          placeholder="Subject line"
        />
      </Field>
      <Field label="Message" required error={errors.html}>
        <RichTextEditor
          value={v.html}
          onChange={html => setV(s => ({ ...s, html }))}
          invalid={!!errors.html}
        />
      </Field>
      {(left.length > 0 || bracket) && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-warn">
          <AlertTriangle className="size-3.5" /> Still to fill in:
          {left.map(n => (
            <code key={n} className="rounded bg-warn-bg px-1">{`{{${n}}}`}</code>
          ))}
          {bracket && <code className="rounded bg-warn-bg px-1">[placeholders]</code>}
        </p>
      )}
      {!!v.attachments.length && (
        <Field
          label="Links included"
          hint="Clients open these without signing in (links expire after 120 days)."
        >
          <div className="flex flex-wrap gap-2">
            {v.attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium"
              >
                <Link2 className="size-3.5" /> {attachmentLabel(a)}
                <button
                  type="button"
                  aria-label={`Remove ${attachmentLabel(a)}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setV(s => ({ ...s, attachments: s.attachments.filter((_, j) => j !== i) }))}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPreview(true)}>
            <Eye /> Preview
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={send.isPending}
            onClick={() => validate() && setSchedule(true)}
          >
            <Clock /> Schedule
          </Button>
          <Button
            type="button"
            disabled={send.isPending || !!q?.blocked}
            onClick={() => validate() && void submit(null)}
          >
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />} {submitLabel}
          </Button>
        </div>
      </div>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email preview</DialogTitle>
          </DialogHeader>
          <EmailPreview
            from={from}
            to={v.to}
            cc={cc}
            subject={v.subject}
            html={v.html}
            attachments={v.attachments}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScheduleDialog
        open={schedule}
        onOpenChange={setSchedule}
        pending={send.isPending}
        onSchedule={at => void submit(at).then(() => setSchedule(false))}
      />
      <ConfirmDialog
        open={!!pendingTemplate}
        onOpenChange={o => !o && setPendingTemplate(null)}
        title="Replace the current message?"
        description={`Applying “${pendingTemplate}” replaces the subject and body you have written.`}
        confirmLabel="Apply template"
        destructive={false}
        onConfirm={() => {
          applyTemplate(pendingTemplate!);
          setPendingTemplate(null);
        }}
      />
    </div>
  );
}

/** Pick a date and time (IST). A check every 15 minutes sends scheduled emails that are due. */
function ScheduleDialog({
  open,
  onOpenChange,
  onSchedule,
  pending
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSchedule: (iso: string) => void;
  pending: boolean;
}) {
  const [date, setDate] = useState(addDays(todayIso(), 1));
  const [time, setTime] = useState('09:30');
  const [error, setError] = useState<{ date?: string; time?: string }>({});
  const go = () => {
    const e: typeof error = {};
    if (!date) e.date = 'Pick a date.';
    if (!time) e.time = 'Pick a time.';
    const iso = date && time ? new Date(`${date}T${time}:00+05:30`).toISOString() : '';
    if (iso && Date.parse(iso) <= Date.now()) e.date = 'Date must be in the future.';
    setError(e);
    if (!Object.keys(e).length) onSchedule(iso);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule email</DialogTitle>
          <DialogDescription>
            Times are in IST (Asia/Kolkata). The email goes out within 15 minutes of the time you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required error={error.date}>
            <Input type="date" min={todayIso()} value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Field label="Time" required error={error.time}>
            <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={go}>
            {pending && <Loader2 className="animate-spin" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
