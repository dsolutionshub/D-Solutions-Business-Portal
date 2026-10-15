/// <reference types="vite/client" />
/**
 * API test harness: the real Hono app against a local D1 (the same simulator `wrangler dev`
 * uses), in memory, with the real migrations applied. One user per role, plus a stranger.
 *
 *   const h = await createHarness();
 *   const res = await h.call('owner', 'POST', '/clients', body);
 */
import { getPlatformProxy } from 'wrangler';
import type { Env } from '../env';
import { app } from '../index';
import { TEST_ROLES } from '../../e2e-fixture/testRoles';

const migrations = import.meta.glob('../../migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Fixed 32-byte key — tests only. */
export const TEST_KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => (i * 7 + 3) % 256)));

export const USERS = {
  // the top role (every permission); keys kept as before so tests read the same
  owner: { id: 'us_owner', email: 'owner@test.example', role: 'Admin' },
  // a custom role with what the old second-level Admin had
  admin: { id: 'us_admin', email: 'admin@test.example', role: 'Manager' },
  dev: { id: 'us_dev', email: 'dev@test.example', role: 'Developer' },
  accounts: { id: 'us_acc', email: 'accounts@test.example', role: 'Accounts' }
} as const;

export { TEST_ROLES };

export type As = keyof typeof USERS | 'stranger' | null;

export interface CallResult<T = any> {
  status: number;
  json: T;
  text: string;
  headers: Headers;
}

export const TEST_ACCESS = { teamDomain: 'test-team.cloudflareaccess.com', aud: 'test-aud-tag' };

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/** One RSA key pair per test process: Access's "certs" endpoint is stubbed to serve its public half. */
let signer: Promise<{ key: CryptoKey; kid: string }> | null = null;
function accessSigner() {
  signer ??= (async () => {
    const pair = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
    const kid = 'test-kid';
    const certs = JSON.stringify({ keys: [{ kid, kty: 'RSA', alg: 'RS256', n: jwk.n, e: jwk.e }] });
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === `https://${TEST_ACCESS.teamDomain}/cdn-cgi/access/certs`)
        return new Response(certs, { headers: { 'content-type': 'application/json' } });
      return real(input, init);
    }) as typeof fetch;
    return { key: pair.privateKey, kid };
  })();
  return signer;
}

/** A Cloudflare Access token for `email` (override claims to test rejections). */
export async function accessJwt(email: string, claims: Record<string, unknown> = {}, signWith?: CryptoKey) {
  const { key, kid } = await accessSigner();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      aud: [TEST_ACCESS.aud],
      email,
      exp: now + 3600,
      iat: now,
      nbf: now,
      iss: `https://${TEST_ACCESS.teamDomain}`,
      sub: 'sub-' + email,
      type: 'app',
      ...claims
    })
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signWith ?? key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function createHarness(over: Partial<Env> = {}) {
  await accessSigner();
  const proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.toml', persist: false });
  const env = {
    ...proxy.env,
    ENVIRONMENT: 'production',
    ACCESS_TEAM_DOMAIN: TEST_ACCESS.teamDomain,
    ACCESS_AUD: TEST_ACCESS.aud,
    ENCRYPTION_KEY: TEST_KEY,
    BREVO_API_KEY: 'test-brevo-key',
    APP_URL: 'https://portal.test',
    EMAIL_FROM_ADDRESS: 'no-reply@portal.test',
    EMAIL_FROM_NAME: 'D Solutions',
    ...over
  } as Env;

  for (const file of Object.keys(migrations).sort())
    for (const stmt of migrations[file]!.split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean))
      await env.DB.prepare(stmt).run();

  for (const [name, permissions] of Object.entries(TEST_ROLES))
    await env.DB.prepare(`INSERT INTO roles (id, name, permissions) VALUES (?, ?, ?)`)
      .bind(`ro_${name.toLowerCase()}`, name, JSON.stringify(permissions))
      .run();
  for (const u of Object.values(USERS))
    await env.DB.prepare(`INSERT INTO users (id, email, name, role, status) VALUES (?, ?, ?, ?, 'Active')`)
      .bind(u.id, u.email, u.role + ' User', u.role)
      .run();

  // Company settings (invoice numbering, hourly rate) and the environments dropdown, as in the app.
  await env.DB.prepare(
    `INSERT INTO settings (id, company, address, gstin, bank, upi, invoice_prefix, next_invoice_no, hourly_rate_paise, notification_prefs)
     VALUES (1, 'D Solutions', 'Bengaluru', '29ABCDE1234F1Z5', 'HDFC · A/c 1234', 'dsol@upi', 'INV-T-', 1, 150000, '{}')`
  ).run();
  for (const [i, env_] of ['DEV', 'QA', 'STG', 'PROD'].entries())
    await env.DB.prepare(
      `INSERT INTO lists (id, list_key, value, sort_order) VALUES (?, 'environments', ?, ?)`
    )
      .bind(`lv_env_${i}`, env_, i)
      .run();

  async function call<T = any>(as: As, method: string, path: string, body?: unknown): Promise<CallResult<T>> {
    const headers: Record<string, string> = {};
    const email = as === 'stranger' ? 'stranger@test.example' : as ? USERS[as].email : null;
    if (email) {
      headers['Cf-Access-Authenticated-User-Email'] = email;
      if (env.ENVIRONMENT !== 'development') headers['Cf-Access-Jwt-Assertion'] = await accessJwt(email);
    }
    const init: RequestInit = { method, headers };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await app.request('/api' + path, init, env);
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  /** Run raw SQL against the test database. */
  const sql = async <T = Record<string, unknown>>(query: string, ...params: unknown[]) =>
    (
      await env.DB.prepare(query)
        .bind(...params)
        .all<T>()
    ).results;

  /** A request with exactly these headers (auth tests). */
  const raw = async (path: string, headers: Record<string, string>, method = 'GET', body?: unknown) => {
    const init: RequestInit = { method, headers: { ...headers } };
    if (body !== undefined) {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await app.request('/api' + path, init, env);
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  };

  /** How many D1 statements `fn` runs (prepared statements + batches), e.g. to catch N+1 queries. */
  async function countQueries(fn: () => Promise<unknown>): Promise<number> {
    const real = env.DB;
    let n = 0;
    env.DB = new Proxy(real, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (prop === 'prepare') return (q: string) => (n++, (v as D1Database['prepare']).call(target, q));
        return typeof v === 'function' ? v.bind(target) : v;
      }
    });
    try {
      await fn();
    } finally {
      env.DB = real;
    }
    return n;
  }

  return { env, call, raw, sql, countQueries, dispose: () => proxy.dispose() };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** A valid client-create body; override what a test cares about. */
export const clientBody = (over: Record<string, unknown> = {}) => ({
  name: 'Kaveri Naturals',
  type: 'D2C brand',
  industry: 'Food & wellness',
  website: 'https://kaverinaturals.in',
  since: '2023-03-14',
  description: null,
  addr1: '2nd Floor, 14 Lavelle Road',
  addr2: null,
  city: 'Bengaluru',
  state: 'Karnataka',
  pin: '560001',
  notes: null,
  status: 'Active',
  primaryContact: {
    name: 'Ananya Rao',
    role: 'Founder & CEO',
    email: 'ananya@kaverinaturals.example',
    phone: '+91 98450 12345',
    altPhone: null
  },
  ...over
});

/** A project body for POST /projects with only the fields a test cares about set. */
export const projectBody = (
  clientId: string,
  over: {
    name?: string;
    environments?: string[];
    domain?: Record<string, unknown>;
    hosting?: Record<string, unknown>;
  } = {}
) => {
  const blank = (keys: string[]) => Object.fromEntries(keys.map(k => [k, null]));
  return {
    project: {
      clientId,
      name: over.name ?? 'Kaveri Storefront',
      type: null,
      status: 'Active',
      startDate: null,
      stack: null,
      environments: over.environments ?? ['PROD']
    },
    sheet: {
      links: {
        ...blank(['staging', 'admin', 'api', 'apiStaging', 'repo']),
        prod: 'https://shop.example.com'
      },
      domain: {
        ...blank([
          'name',
          'registrar',
          'account',
          'purchased',
          'expiry',
          'cost',
          'renewal',
          'dns',
          'sslProvider',
          'sslExpiry',
          'sslCost'
        ]),
        auto: 'Off',
        ...over.domain
      },
      hosting: {
        ...blank(['platform', 'plan', 'region', 'ip', 'account', 'cost', 'cycle', 'nextBill']),
        ...over.hosting
      },
      db: blank(['engine', 'host', 'port', 'name', 'user', 'console', 'backup']),
      keys: blank(['googleClientId', 'payGateway', 'payKeyId', 'shipping', 'ga4', 'pixel']),
      notes: null
    }
  };
};

/**
 * Replace global fetch for Brevo calls only (everything else — e.g. the local D1 proxy — passes
 * through). Returns the captured Brevo request bodies; `reply` decides the response.
 */
export function mockBrevo(
  reply: (body: any) => { status: number; json: unknown } = () => ({
    status: 201,
    json: { messageId: '<test@brevo>' }
  })
) {
  const real = globalThis.fetch;
  const calls: any[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://api.brevo.com/')) return real(input, init);
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ ...body, apiKey: (init?.headers as Record<string, string>)?.['api-key'] });
    const r = reply(body);
    return new Response(JSON.stringify(r.json), {
      status: r.status,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}
