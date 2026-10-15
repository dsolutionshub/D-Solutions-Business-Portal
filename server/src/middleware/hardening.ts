/**
 * Request-level protections: request id + structured logs, security headers, body size limit,
 * a per-user rate limit on changes, and CORS only for the no-custom-domain fallback.
 */
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { HttpError } from './errors';

/** One JSON line per request: what happened, never bodies or secrets. */
export const requestLog = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
  c.set('requestId', requestId);
  const started = Date.now();
  await next();
  c.header('X-Request-Id', requestId);
  const status = c.res.status;
  // health checks every few minutes would drown the log
  if (c.req.path === '/api/health' && status === 200) return;
  console.log(
    JSON.stringify({
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      ms: Date.now() - started,
      user: c.get('user')?.id ?? null
    })
  );
});

/**
 * The printable invoice/receipt pages run one inline script (auto-print). Its hash is pinned so
 * the page can have a strict CSP; `security.test.ts` fails if the script changes.
 */
export const PRINT_SCRIPT_HASH = "'sha256-KRKx941W4wrVR+lAhilgZUe92mV/9OpvFfq2IPGZCoo='";

const JSON_CSP = "default-src 'none'; frame-ancestors 'none'";
const HTML_CSP = `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src ${PRINT_SCRIPT_HASH}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

/** Headers for every API response (the app's own pages get theirs from Pages `_headers`). */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  const html = (c.res.headers.get('Content-Type') ?? '').includes('text/html');
  c.header('Content-Security-Policy', html ? HTML_CSP : JSON_CSP);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

/** JSON bodies up to 256 KB (email bodies are the largest); uploads (logos) up to 1.5 MB. */
export const limitBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  const multipart = (c.req.header('Content-Type') ?? '').startsWith('multipart/');
  return bodyLimit({
    maxSize: multipart ? 1.5 * 1024 * 1024 : 256 * 1024,
    onError: () => {
      throw new HttpError(413, 'too_large', 'That request is too large.');
    }
  })(c, next);
};

/**
 * Changes (POST/PUT/PATCH/DELETE) per user per minute, per Worker instance. A brake on runaway
 * scripts and stuck buttons; the edge rate-limiting rule in docs/DEPLOY.md is the hard limit.
 */
export const MUTATIONS_PER_MINUTE = 120;
const windows = new Map<string, { start: number; count: number }>();

export const rateLimitMutations = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') return next();
  const key = c.get('user')?.id ?? c.req.header('cf-connecting-ip') ?? 'anon';
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= 60_000) windows.set(key, { start: now, count: 1 });
  else if (++w.count > MUTATIONS_PER_MINUTE) {
    c.header('Retry-After', String(Math.ceil((w.start + 60_000 - now) / 1000)));
    throw new HttpError(
      429,
      'rate_limited',
      'Too many changes in a short time. Wait a minute and try again.'
    );
  }
  if (windows.size > 5000) windows.clear(); // bounded memory
  await next();
});

/** For tests. */
export const resetRateLimits = () => windows.clear();

/**
 * CORS: off by default — the app and the API share one origin (app.<domain>/api/* → Worker).
 * Only the documented fallback (app on pages.dev, API on workers.dev) sets CORS_ORIGINS.
 */
export const corsIfConfigured = createMiddleware<AppEnv>(async (c, next) => {
  const origins = (c.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  if (!origins.length) return next();
  return cors({
    origin: o => (origins.includes(o) ? o : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type'],
    maxAge: 600
  })(c, next);
});
