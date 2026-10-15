import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { projectSheet } from './schema';
import { rowToSheet, SHEET_COLUMNS, sheetToRow } from './sheetMap';

describe('sheetMap', () => {
  it('maps every non-secret sheet field to a real project_sheet column, and nothing else', () => {
    const columns = Object.keys(getTableColumns(projectSheet));
    for (const c of SHEET_COLUMNS) expect(columns).toContain(c.column);
    const mapped = new Set(SHEET_COLUMNS.map(c => c.column as string));
    // social media moved to the client (migration 0006); the old columns stay, unused
    const retired = ['linksDev', 'socialInstagram', 'socialFacebook', 'socialYoutube', 'socialOther'];
    const extra = columns.filter(
      c => !mapped.has(c) && !['projectId', 'notes', 'createdAt', 'updatedAt', ...retired].includes(c)
    );
    expect(extra).toEqual([]);
  });

  it('round-trips a sheet (auto-renew On/Off ↔ boolean, money in paise)', () => {
    const blankSection = (section: string) =>
      Object.fromEntries(SHEET_COLUMNS.filter(c => c.section === section).map(c => [c.key, null]));
    const sheet = {
      links: { ...blankSection('links'), prod: 'https://shop.example.com' },
      domain: {
        ...blankSection('domain'),
        name: 'example.com',
        auto: 'On',
        cost: 79900,
        expiry: '2027-01-01'
      },
      hosting: { ...blankSection('hosting'), platform: 'Vercel', cycle: 'Monthly', cost: 504000 },
      db: blankSection('db'),
      keys: blankSection('keys'),
      notes: 'Freeze deploys in Diwali week'
    };
    const row = sheetToRow('pj_1', sheet as never);
    expect(row).toMatchObject({
      domainAutoRenew: true,
      domainCostPaise: 79900,
      hostingCostPaise: 504000,
      linksProd: 'https://shop.example.com'
    });
    const back = rowToSheet({ ...row, createdAt: 'x', updatedAt: '2026-10-12T00:00:00.000Z' } as never);
    expect(back.domain).toEqual(sheet.domain);
    expect(back.notes).toBe(sheet.notes);
  });
});
