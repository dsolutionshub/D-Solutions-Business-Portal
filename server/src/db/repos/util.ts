import type { AuditAction } from '@dsol/shared';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Db } from '../client';
import { newId } from '../ids';
import { auditLog } from '../schema';

/** Run statements atomically (D1 batch = one transaction). */
export async function runBatch(db: Db, statements: BatchItem<'sqlite'>[]): Promise<void> {
  if (!statements.length) return;
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
}

/** Append to audit_log. `meta` must never contain secret values. */
export function auditEntry(entry: {
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
}) {
  return { id: newId('audit'), ...entry, meta: entry.meta ?? null };
}

export const insertAudit = (db: Db, entry: Parameters<typeof auditEntry>[0]) =>
  db.insert(auditLog).values(auditEntry(entry));

/** "/api/clients/cl_x/logo?v=ab12" — the version makes a new upload bypass caches. */
export const logoUrl = (clientId: string, logoKey: string | null) =>
  logoKey ? `/api/clients/${clientId}/logo?v=${encodeURIComponent(logoKey.split('-').pop() ?? '')}` : null;

/** SQL LIKE pattern for a search term, with %, _ and \ escaped (use with ESCAPE '\'). */
export const likePattern = (q: string) => `%${q.toLowerCase().replace(/[\\%_]/g, c => '\\' + c)}%`;

/**
 * One CSV cell, quoted. Text starting with = + - @ (or a tab / CR) gets a leading ' so a
 * spreadsheet doesn't run it as a formula (CSV injection); numbers are written as is.
 */
export const csvCell = (v: unknown) => {
  if (typeof v === 'number') return String(v);
  const s = String(v ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
};

export const toCsv = (rows: readonly (readonly unknown[])[]) =>
  rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
