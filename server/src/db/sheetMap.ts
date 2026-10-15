/**
 * project_sheet row ↔ ProjectSheet (API shape), derived from SHEET_SECTIONS.
 *
 *   column = section + Field   (domain.sslExpiry → domainSslExpiry)
 *   money  = … + "Paise"       (domain.cost → domainCostPaise)
 *   domain.auto ("On"/"Off")  ↔ domainAutoRenew (boolean)
 *
 * Secret fields are not here — they live in project_secrets.
 */
import { SHEET_SECTIONS, type ProjectSheet, type ProjectSheetCreate } from '@dsol/shared';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { projectSheet } from './schema';

type SheetRow = InferSelectModel<typeof projectSheet>;
type SheetInsert = InferInsertModel<typeof projectSheet>;
type SectionKey = (typeof SHEET_SECTIONS)[number]['key'];

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Every non-secret sheet field and its column. */
export const SHEET_COLUMNS = SHEET_SECTIONS.flatMap(s =>
  s.fields
    .filter(f => f.type !== 'secret')
    .map(f => ({
      section: s.key as SectionKey,
      key: f.key as string,
      type: f.type,
      column: (s.key === 'domain' && f.key === 'auto'
        ? 'domainAutoRenew'
        : s.key + cap(f.key) + (f.type === 'money' ? 'Paise' : '')) as keyof SheetRow
    }))
);

export function sheetToRow(projectId: string, sheet: ProjectSheetCreate): SheetInsert {
  const row: Record<string, unknown> = { projectId, notes: sheet.notes };
  for (const { section, key, column } of SHEET_COLUMNS) {
    const value = (sheet[section] as Record<string, unknown>)[key];
    row[column] = column === 'domainAutoRenew' ? value === 'On' : (value ?? null);
  }
  return row as SheetInsert;
}

export function rowToSheet(row: SheetRow): ProjectSheet {
  const sheet: Record<string, Record<string, unknown>> = {};
  for (const { section, key, column } of SHEET_COLUMNS) {
    sheet[section] ??= {};
    const value = row[column];
    sheet[section][key] = column === 'domainAutoRenew' ? (value ? 'On' : 'Off') : (value ?? null);
  }
  return { projectId: row.projectId, ...sheet, notes: row.notes, updatedAt: row.updatedAt } as ProjectSheet;
}
