/**
 * Brevo transactional email (Worker only — the API key never reaches the browser).
 * https://developers.brevo.com/reference/sendtransacemail
 *
 * Local development without BREVO_API_KEY: the email is written to the console and reported as
 * "Logged (dev)", so flows that send email keep working. In production a missing key is a failure.
 */
import { htmlToText } from '@dsol/shared';
import type { Env } from '../env';

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface Sender {
  name: string;
  email: string;
}

export interface OutgoingEmail {
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  html: string;
}

export interface DeliveryResult {
  status: 'Sent' | 'Logged (dev)' | 'Failed';
  messageId: string | null;
  error: string | null;
}

/** True when emails are only logged (local development with no Brevo key). */
export const isDevEmail = (env: Pick<Env, 'ENVIRONMENT' | 'BREVO_API_KEY'>) =>
  env.ENVIRONMENT === 'development' && !env.BREVO_API_KEY;

/** Settings sender, falling back to the EMAIL_FROM_* Worker variables. */
export function senderFrom(
  env: Pick<Env, 'EMAIL_FROM_NAME' | 'EMAIL_FROM_ADDRESS'>,
  settings: { emailFromName: string | null; emailFromAddress: string | null; company: string } | null
): Sender {
  return {
    name: settings?.emailFromName || env.EMAIL_FROM_NAME || settings?.company || 'D Solutions',
    email: settings?.emailFromAddress || env.EMAIL_FROM_ADDRESS
  };
}

export async function deliver(
  env: Pick<Env, 'ENVIRONMENT' | 'BREVO_API_KEY'>,
  sender: Sender,
  mail: OutgoingEmail
): Promise<DeliveryResult> {
  if (isDevEmail(env)) {
    console.log(
      [
        '── email (dev, not sent) ──',
        `From: ${sender.name} <${sender.email}>`,
        `To: ${mail.to.join(', ')}`,
        mail.cc?.length ? `Cc: ${mail.cc.join(', ')}` : null,
        `Subject: ${mail.subject}`,
        '',
        htmlToText(mail.html),
        '───────────────────────────'
      ]
        .filter(l => l !== null)
        .join('\n')
    );
    return { status: 'Logged (dev)', messageId: null, error: null };
  }
  if (!env.BREVO_API_KEY)
    return {
      status: 'Failed',
      messageId: null,
      error: 'Email is not set up: the BREVO_API_KEY secret is missing.'
    };

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        sender,
        to: mail.to.map(email => ({ email })),
        ...(mail.cc?.length ? { cc: mail.cc.map(email => ({ email })) } : {}),
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: htmlToText(mail.html)
      })
    });
    const body = (await res.json().catch(() => null)) as { messageId?: string; message?: string } | null;
    if (!res.ok)
      return {
        status: 'Failed',
        messageId: null,
        error: `Brevo ${res.status}: ${body?.message ?? res.statusText}`
      };
    return { status: 'Sent', messageId: body?.messageId ?? null, error: null };
  } catch (err) {
    return {
      status: 'Failed',
      messageId: null,
      error: `Could not reach Brevo: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}

/** Wrap a message body in a minimal, email-client-safe layout. */
export function emailLayout(bodyHtml: string, links: readonly { label: string; url: string }[] = []): string {
  const linkBlock = links.length
    ? `<p style="margin:20px 0 0">${links
        .map(
          l =>
            `<a href="${l.url.replace(/"/g, '&quot;')}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 16px;background:#4f46e5;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">${l.label}</a>`
        )
        .join('')}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937"><div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px">${bodyHtml}${linkBlock}</div></body></html>`;
}
