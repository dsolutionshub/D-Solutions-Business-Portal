import { escapeHtml, sanitizeEmailHtml, type EmailAttachment } from '@dsol/shared';
import { attachmentLabel } from '../compose';
import { Link2 } from 'lucide-react';

/** {{variables}} still in the text, highlighted so they can't be missed. */
const markVariables = (html: string) =>
  html.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, n: string) => `<mark class="rounded bg-warn-bg px-0.5 text-warn">{{${n}}}</mark>`
  );

/** How an email will look: From / To / Subject and the (sanitized) body, with link buttons. */
export function EmailPreview({
  from,
  to,
  cc,
  subject,
  html,
  attachments = []
}: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  const body = markVariables(sanitizeEmailHtml(html || '<p></p>'));
  return (
    <div className="overflow-hidden rounded-lg border bg-white text-slate-800">
      <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 border-b bg-slate-50 px-4 py-3 text-[13px]">
        <dt className="text-slate-500">From</dt>
        <dd className="min-w-0 break-words">{from}</dd>
        <dt className="text-slate-500">To</dt>
        <dd className="min-w-0 break-words">{to.length ? to.join(', ') : '—'}</dd>
        {!!cc?.length && (
          <>
            <dt className="text-slate-500">Cc</dt>
            <dd className="min-w-0 break-words">{cc.join(', ')}</dd>
          </>
        )}
        <dt className="text-slate-500">Subject</dt>
        <dd
          className="min-w-0 break-words font-semibold"
          dangerouslySetInnerHTML={{ __html: markVariables(escapeHtml(subject || '(no subject)')) }}
        />
      </dl>
      <div
        className="email-body px-5 py-4 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: body }}
      />
      {!!attachments.length && (
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          {attachments.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Link2 className="size-3.5" /> {attachmentLabel(a)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
