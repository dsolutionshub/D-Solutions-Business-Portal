/**
 * Email template variables: {{client_name}}, {{invoice_no}}, …  (TEMPLATE_VARIABLES).
 * Values are HTML-escaped when filled into the body. A variable with no value, or one that isn't
 * a known variable, stays visible as {{name}} and is reported so the preview can flag it.
 */
import { TEMPLATE_VARIABLES, type TemplateVariable } from '../constants';
import { escapeHtml } from './paper';

export type TemplateValues = Partial<Record<TemplateVariable, string | null | undefined>>;

export interface RenderedTemplate {
  subject: string;
  html: string;
  /** {{names}} that aren't template variables at all (typos) */
  unknown: string[];
  /** known variables that had no value */
  missing: TemplateVariable[];
}

const VAR = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const isKnown = (name: string): name is TemplateVariable => name in TEMPLATE_VARIABLES;

/** Every {{name}} used in a text, in order of first use. */
export function templateVariables(text: string): string[] {
  return [...new Set([...text.matchAll(VAR)].map(m => m[1]!))];
}

export function renderTemplate(subject: string, html: string, values: TemplateValues): RenderedTemplate {
  const unknown = new Set<string>();
  const missing = new Set<TemplateVariable>();
  const fill = (text: string, escape: boolean) =>
    text.replace(VAR, (whole, name: string) => {
      if (!isKnown(name)) {
        unknown.add(name);
        return whole;
      }
      const v = values[name];
      if (v === null || v === undefined || v === '') {
        missing.add(name);
        return whole;
      }
      // release_notes is HTML we build ourselves (escaped list items), everything else is text
      return escape && name !== 'release_notes' ? escapeHtml(v) : v;
    });
  return {
    subject: fill(subject, false),
    html: fill(html, true),
    unknown: [...unknown],
    missing: [...missing]
  };
}

/** Any {{variable}} left in a subject or body — sending is blocked until they're resolved. */
export const unresolvedVariables = (subject: string, html: string) => templateVariables(subject + ' ' + html);

/** "<ul><li>…</li></ul>" for a release's features and fixes (escaped). */
export function releaseNotesHtml(features: readonly string[], fixes: readonly string[]): string {
  const list = (title: string, items: readonly string[]) =>
    items.length
      ? `<p><b>${title}</b></p><ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
      : '';
  return list('What’s new', features) + list('Fixes', fixes);
}
