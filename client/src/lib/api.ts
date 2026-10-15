import type { ApiErrorBody } from '@dsol/shared';

const BASE = import.meta.env.VITE_API_BASE || '/api';
/**
 * Normally the API is on the same origin (/api). Only the documented fallback without a custom
 * domain sets VITE_API_BASE to another host; then the Access cookie must go along cross-origin.
 */
const CREDENTIALS: RequestCredentials = /^https?:\/\//.test(BASE) ? 'include' : 'same-origin';

/** An API failure. `fields` maps form field paths to messages (validation and conflicts). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Pages anyone may open without signing in. */
export const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

/** Not signed in (or the session ended): go to the sign-in page, then come back here. */
function toSignIn() {
  if (typeof window === 'undefined' || PUBLIC_PATHS.includes(window.location.pathname)) return;
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = { method, credentials: CREDENTIALS };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) toSignIn();
    const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
    const err = data?.error;
    throw new ApiError(
      res.status,
      err?.code ?? String(res.status),
      err?.message ?? (res.status === 401 ? 'Please sign in.' : `Request failed (${res.status}).`),
      err?.fields
    );
  }
  return res;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  /** multipart upload, e.g. a logo */
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
  /** Download a file the API serves as an attachment (CSV, JSON, text). */
  async download(path: string, fallbackName: string): Promise<void> {
    const res = await send('GET', path);
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

/** Build a query string, skipping empty values. */
export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? '?' + s : '';
};
