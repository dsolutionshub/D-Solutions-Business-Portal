import { describe, expect, it } from 'vitest';
import { DEFAULT_EMAIL_TEMPLATES } from './defaultTemplates';
import { htmlToText, sanitizeEmailHtml } from './sanitize';
import { releaseNotesHtml, renderTemplate, templateVariables, unresolvedVariables } from './template';

describe('renderTemplate', () => {
  it('fills known variables, escaping values', () => {
    const r = renderTemplate('Invoice {{invoice_no}}', '<p>Hi {{contact}}, {{client_name}}</p>', {
      invoice_no: 'INV-1',
      contact: 'Ana',
      client_name: 'A & B <Co>'
    });
    expect(r.subject).toBe('Invoice INV-1');
    expect(r.html).toBe('<p>Hi Ana, A &amp; B &lt;Co&gt;</p>');
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it('leaves missing and unknown variables visible and reports them', () => {
    const r = renderTemplate('{{project}}', '<p>{{contact}} {{clinet}}</p>', { contact: '' });
    expect(r.subject).toBe('{{project}}');
    expect(r.html).toBe('<p>{{contact}} {{clinet}}</p>');
    expect(r.missing).toEqual(['project', 'contact']);
    expect(r.unknown).toEqual(['clinet']);
    expect(unresolvedVariables(r.subject, r.html)).toEqual(['project', 'contact', 'clinet']);
  });

  it('inserts release notes as a list with escaped items', () => {
    expect(releaseNotesHtml(['A <b>'], [])).toBe('<p><b>What’s new</b></p><ul><li>A &lt;b&gt;</li></ul>');
  });

  it('every default template uses only known variables', () => {
    for (const t of DEFAULT_EMAIL_TEMPLATES)
      expect(renderTemplate(t.subject, t.bodyHtml, {}).unknown, t.name).toEqual([]);
    expect(templateVariables(DEFAULT_EMAIL_TEMPLATES[0]!.subject)).toEqual(['project', 'version']);
  });
});

describe('sanitizeEmailHtml', () => {
  it('keeps formatting, drops scripts, handlers and unsafe links', () => {
    const out = sanitizeEmailHtml(
      '<p class="x" onclick="evil()">Hi <b>there</b><script>alert(1)</script><img src=x onerror=alert(1)>' +
        '<a href="javascript:alert(1)">bad</a> <a href="https://ok.example/?a=1&amp;b=2">ok</a><iframe src="x"></iframe><!-- c --></p>'
    );
    expect(out).toBe(
      '<p>Hi <b>there</b><a>bad</a> <a href="https://ok.example/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok</a></p>'
    );
  });

  it('treats a stray < as text and closes no void tags', () => {
    expect(sanitizeEmailHtml('a < b<br></br>')).toBe('a &lt; b<br>');
    expect(sanitizeEmailHtml('<a href=" JaVaScRiPt:x">y</a>')).toBe('<a>y</a>');
    expect(sanitizeEmailHtml('<a href="&#106;avascript:x">y</a>')).toBe('<a>y</a>');
  });

  it('turns HTML into readable text', () => {
    expect(htmlToText('<p>Hi&nbsp;Ana</p><ul><li>One</li><li>Two</li></ul>')).toBe('Hi Ana\nOne\nTwo');
  });
});
