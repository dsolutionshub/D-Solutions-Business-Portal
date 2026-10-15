/**
 * Hardening: no secret ever leaves in a response, security headers, limits, generic errors,
 * the health endpoint, audit recording, and the daily-job watchdog.
 */
import { printablePage } from '@dsol/shared';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDaily } from '../cron/daily';
import type { AppEnv } from '../env';
import { errorHandler } from '../middleware/errorHandler';
import { MUTATIONS_PER_MINUTE, PRINT_SCRIPT_HASH, resetRateLimits } from '../middleware/hardening';
import { clientBody, createHarness, mockBrevo, projectBody, type Harness } from '../test/harness';

let h: Harness;
let clientId: string;
let projectId: string;
const SECRET = 'demo-placeholder-not-a-real-secret';
const OTHER = 'algolia-admin-key-very-secret';
let brevo: ReturnType<typeof mockBrevo> | null = null;
afterEach(() => {
  brevo?.restore();
  brevo = null;
});

beforeAll(async () => {
  h = await createHarness();
  clientId = (await h.call('owner', 'POST', '/clients', clientBody())).json.id;
  const r = await h.call('owner', 'POST', '/projects', {
    ...projectBody(clientId, { domain: { name: 'kaveri.example' } }),
    secrets: { 'db.password': SECRET, 'keys.paySecret': SECRET },
    extraKeys: [{ label: 'Algolia admin key', isSecret: true, value: OTHER }]
  });
  expect(r.status).toBe(201);
  projectId = r.json.project.id;
});
afterAll(() => h?.dispose());

describe('secrets never leave in a response', () => {
  it('no plaintext and no ciphertext in project pages, lists, sheet, exports or the audit log', async () => {
    const stored = await h.sql<{ ciphertext: string; iv: string }>(
      'SELECT ciphertext, iv FROM project_secrets UNION ALL SELECT ciphertext, iv FROM extra_keys WHERE is_secret = 1'
    );
    expect(stored.length).toBe(3);
    // a reveal, so the audit log has an entry
    expect(
      (await h.call('owner', 'POST', `/projects/${projectId}/secrets/reveal`, { field: 'db.password' })).json
        .value
    ).toBe(SECRET);

    const responses = await Promise.all(
      [
        ['owner', `/projects/${projectId}`],
        ['owner', '/projects'],
        ['owner', `/projects/${projectId}/sheet.txt`],
        ['owner', `/clients/${clientId}`],
        ['owner', '/clients/export.csv'],
        ['owner', `/clients/${clientId}/export`],
        ['admin', '/admin/export'],
        ['accounts', `/projects/${projectId}`],
        ['dev', `/projects/${projectId}`]
      ].map(([as, path]) => h.call(as as 'owner', 'GET', path!).then(r => ({ path, ...r })))
    );
    for (const r of responses) {
      expect(r.status, r.path).toBe(200);
      expect(r.text, r.path).not.toContain(SECRET);
      expect(r.text, r.path).not.toContain(OTHER);
      for (const s of stored) {
        expect(r.text, r.path).not.toContain(s.ciphertext);
        expect(r.text, r.path).not.toContain(s.iv);
      }
    }
    expect(responses.find(r => r.path === '/admin/export')!.json.projectSecrets[0].value).toBe('[hidden]');
  });
});

describe('headers, limits and errors', () => {
  it('sends security headers and a request id on every API response', async () => {
    const r = await h.call('owner', 'GET', '/clients');
    expect(r.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('x-request-id')).toBeTruthy();
  });

  it('pins the printable pages’ one inline script by hash', () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(printablePage('t', '<p></p>'))![1]!;
    expect(`'sha256-${createHash('sha256').update(script).digest('base64')}'`).toBe(PRINT_SCRIPT_HASH);
  });

  it('refuses bodies over the limit', async () => {
    const r = await h.call('owner', 'POST', '/clients', { ...clientBody(), notes: 'x'.repeat(300 * 1024) });
    expect(r.status).toBe(413);
  });

  it('rate-limits changes per user', async () => {
    resetRateLimits();
    let last = 0;
    for (let i = 0; i <= MUTATIONS_PER_MINUTE; i++)
      last = (await h.call('dev', 'POST', '/notices', {})).status;
    expect(last).toBe(429);
    expect((await h.call('dev', 'GET', '/notices')).status).toBe(200); // reads are not limited
    expect((await h.call('owner', 'POST', '/notices', {})).status).toBe(400); // other users are not affected
    resetRateLimits();
  });

  it('answers unexpected errors with a generic message and a reference, never details', async () => {
    const app = new Hono<AppEnv>();
    app.use(async (c, next) => (c.set('requestId', 'req-123'), next()));
    app.get('/boom', () => {
      throw new Error('SQLITE_ERROR: no such column secret_value');
    });
    app.onError(errorHandler);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/boom');
    expect(log.mock.calls[0]![0]).toContain('SQLITE_ERROR'); // details go to the log…
    log.mockRestore();
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).toContain('reference req-123');
    expect(body).not.toContain('SQLITE');
  });
});

describe('health and monitoring', () => {
  it('/api/health answers without sign-in and shares no data', async () => {
    const r = await h.call(null, 'GET', '/health');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, version: 'dev', checks: { database: 'ok', dailyJob: 'never' } });
  });

  it('reports a stale daily job, and the next run emails the Admins once', async () => {
    const old = new Date(Date.now() - 30 * 3_600_000).toISOString();
    await h.env.DB.prepare(
      `INSERT INTO cron_runs (id, run_date, trigger, started_at, finished_at, counts, errors) VALUES ('cr_old', '2026-01-01', 'schedule', ?, ?, '{}', '[]')`
    )
      .bind(old, old)
      .run();
    const health = await h.call(null, 'GET', '/health');
    expect(health.status).toBe(503);
    expect(health.json.checks.dailyJob).toBe('stale');

    brevo = mockBrevo();
    await runDaily(h.env, { trigger: 'schedule' });
    const alert = brevo.calls.find(c => /daily job had a problem/.test(c.subject));
    expect(alert.to).toEqual([{ email: 'owner@test.example' }]);
    expect(alert.htmlContent).toContain('did not run between');
    expect((await h.call(null, 'GET', '/health')).json.checks.dailyJob).toBe('ok');
  });
});

describe('audit log', () => {
  it('is still recorded on the server, but no longer readable through the API', async () => {
    expect((await h.call('owner', 'GET', '/audit')).status).toBe(404);
    const rows = await h.sql<{ entity_id: string }>(
      "SELECT entity_id FROM audit_log WHERE action = 'secret.reveal'"
    );
    expect(rows.map(r => r.entity_id)).toEqual([projectId]);
  });
});
