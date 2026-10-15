import {
  htmlToText,
  releaseNotesHtml,
  renderTemplate,
  TEMPLATE_VARIABLES,
  templateVariables,
  type EmailTemplateView,
  type TemplateValues,
  type TemplateVariable
} from '@dsol/shared';
import type { Editor } from '@tiptap/react';
import { Loader2, Pencil, Plus, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Field } from '@/components/common/Field';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useSettings } from '@/lib/lookups';
import { useSaveTemplate, useTemplates } from '../api';
import { EmailLayout } from '../components/EmailLayout';
import { EmailPreview } from '../components/EmailPreview';
import { RichTextEditor } from '../components/RichTextEditor';

/** Values used to preview a template (the real ones are filled when composing). */
const SAMPLE: TemplateValues = {
  client_name: 'Kaveri Naturals',
  contact: 'Ananya',
  project: 'Kaveri Storefront',
  version: 'v3.8.0',
  release_notes: releaseNotesHtml(['Size guide', 'Express checkout'], ['Cart flicker']),
  invoice_no: 'INV-2026-0149',
  amount: '₹1,18,000',
  due_date: '28 Oct 2026',
  receipt_no: 'RCPT-0093',
  domain: 'kaverinaturals.in',
  expiry: '22 Oct 2026'
};

/** Email Center → Templates. */
export function TemplatesPage() {
  const q = useTemplates();
  const canEdit = useCan('templates.write');
  const canSend = useCan('emails.send');
  const [editing, setEditing] = useState<EmailTemplateView | 'new' | null>(null);

  return (
    <EmailLayout>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <p className="text-sm text-muted-foreground">
          Reusable emails. <code className="rounded bg-muted px-1">{'{{variables}}'}</code> are filled in when
          you compose; anything left over is flagged before sending.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> New template
          </Button>
        )}
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : q.data.length ? (
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map(t => {
            const text = htmlToText(t.bodyHtml);
            return (
              <article key={t.id} className="flex flex-col gap-2 rounded-xl border p-4">
                <h2 className="font-semibold">{t.name}</h2>
                <p className="text-xs text-muted-foreground">Subject: {t.subject}</p>
                <p className="line-clamp-3 flex-1 text-[13px] text-subtle-foreground">
                  {text.length > 140 ? text.slice(0, 140) + '…' : text}
                </p>
                <div className="flex flex-wrap gap-1">
                  {t.variables.map(v => (
                    <code
                      key={v}
                      className={
                        v in TEMPLATE_VARIABLES
                          ? 'rounded bg-muted px-1 text-[11px]'
                          : 'rounded bg-warn-bg px-1 text-[11px] text-warn'
                      }
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
                <div className="mt-1 flex gap-2">
                  {canSend && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/email/compose?template=${encodeURIComponent(t.name)}`}>
                        <Send /> Use template
                      </Link>
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                      <Pencil /> Edit
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No templates" description="Add one to reuse it when composing emails." />
      )}
      <TemplateDialog template={editing} onOpenChange={o => !o && setEditing(null)} />
    </EmailLayout>
  );
}

function TemplateDialog({
  template,
  onOpenChange
}: {
  template: EmailTemplateView | 'new' | null;
  onOpenChange: (o: boolean) => void;
}) {
  const existing = template && template !== 'new' ? template : null;
  const save = useSaveTemplate(existing?.id);
  const settings = useSettings().data;
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastFocus, setLastFocus] = useState<'subject' | 'body'>('body');
  const editor = useRef<Editor | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!template) return;
    setName(existing?.name ?? '');
    setSubject(existing?.subject ?? '');
    setHtml(existing?.bodyHtml ?? '<p>Hi {{contact}},</p><p></p><p>Regards,<br>{{company}}</p>');
    setErrors({});
  }, [template]); // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (v: TemplateVariable) => {
    const token = `{{${v}}}`;
    if (lastFocus === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const at = el.selectionStart ?? subject.length;
      setSubject(subject.slice(0, at) + token + subject.slice(el.selectionEnd ?? at));
      requestAnimationFrame(() => (el.focus(), el.setSelectionRange(at + token.length, at + token.length)));
    } else editor.current?.chain().focus().insertContent(token).run();
  };

  const used = templateVariables(subject + ' ' + html);
  const unknown = used.filter(v => !(v in TEMPLATE_VARIABLES));
  const preview = renderTemplate(subject, html, { ...SAMPLE, company: settings?.company ?? 'D Solutions' });

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name the template.';
    if (!subject.trim()) e.subject = 'Subject is required.';
    if (!htmlToText(html)) e.bodyHtml = 'Template body is empty.';
    setErrors(e);
    if (Object.keys(e).length) return void toast.error('Please fix the highlighted fields.');
    try {
      await save.mutateAsync({ name: name.trim(), subject: subject.trim(), bodyHtml: html });
      toast.success(`Template “${name.trim()}” saved`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : 'Could not save the template.');
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : 'New template'}</DialogTitle>
          <DialogDescription>
            Click a variable to insert it where the cursor is (subject or message).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <Field label="Name" required error={errors.name}>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <Field label="Subject" required error={errors.subject}>
              <Input
                ref={subjectRef}
                value={subject}
                onFocus={() => setLastFocus('subject')}
                onChange={e => setSubject(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Variables">
              {(Object.entries(TEMPLATE_VARIABLES) as [TemplateVariable, string][]).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  title={label}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => insert(v)}
                  className="rounded-full border px-2.5 py-1 font-mono text-[11px] text-subtle-foreground hover:border-primary hover:text-primary-soft-foreground"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
            <Field label="Message" required error={errors.bodyHtml}>
              <div onFocus={() => setLastFocus('body')}>
                <RichTextEditor
                  value={html}
                  onChange={setHtml}
                  invalid={!!errors.bodyHtml}
                  onReady={e => (editor.current = e)}
                />
              </div>
            </Field>
            {!!unknown.length && (
              <p className="text-xs text-warn">
                Not a known variable (it will stay as typed): {unknown.map(v => `{{${v}}}`).join(', ')}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <div className="mb-2 text-xs text-muted-foreground">Preview with sample values</div>
            <EmailPreview
              from={
                settings
                  ? `${settings.emailFromName || settings.emailDefaults.name} <${settings.emailFromAddress || settings.emailDefaults.address}>`
                  : ''
              }
              to={['ananya@kaverinaturals.in']}
              subject={preview.subject}
              html={preview.html}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => void submit()}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
