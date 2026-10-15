/**
 * Allow-list sanitizer for email bodies written in the rich-text editor (and templates).
 * Keeps simple formatting tags, drops every attribute except a safe href on links, and removes
 * script/style/iframe/… elements together with their content. Text between tags is kept as is
 * (the editor already escapes it). Runs on the server before storing or sending, and in the
 * client before previewing.
 */

const ALLOWED = new Set([
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'a',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'hr',
  'code',
  'pre',
  'span',
  'div'
]);
const VOID = new Set(['br', 'hr']);
/** Removed with everything inside them. */
const DROP_WITH_CONTENT = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'template',
  'svg',
  'math',
  'textarea',
  'select',
  'title',
  'head'
];

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export function sanitizeEmailHtml(input: string): string {
  let html = input.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of DROP_WITH_CONTENT)
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, 'gi'), '');
  return html.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>|<[^>]*$|</g,
    (whole, name?: string, attrs?: string) => {
      if (!name) return whole === '<' ? '&lt;' : '';
      const tag = name.toLowerCase();
      if (!ALLOWED.has(tag)) return '';
      if (whole.startsWith('</')) return VOID.has(tag) ? '' : `</${tag}>`;
      if (tag === 'a') {
        const m = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs ?? '');
        const href = decodeEntities((m?.[2] ?? m?.[3] ?? m?.[4] ?? '').trim());
        return SAFE_HREF.test(href)
          ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`
          : '<a>';
      }
      return `<${tag}>`;
    }
  );
}

const decodeEntities = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : '';
  });

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain text of an HTML body (for "is it empty?" checks and the text part of emails). */
export const htmlToText = (html: string) =>
  html
    .replace(/<(br|\/p|\/li|\/h[1-3]|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
