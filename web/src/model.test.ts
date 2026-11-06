import { describe, expect, it } from 'vitest';
import { parseImport, exportRecords, dayKey, monthRange, shiftMonth, summarize } from './model';

describe('Android migration and calendar', () => {
  it('preserves Android v1 data as unassigned and v2 identities', () => {
    const row = { id: 'uuid-1', type: 'FOOD', timestamp: 1234, grams: 0 };
    expect(parseImport(JSON.stringify({ version: 1, records: [row] }))[0]).toMatchObject({
      id: 'uuid-1',
      occurredAt: 1234,
      catId: 'UNASSIGNED',
      grams: 0,
    });
    for (const cat of ['MONET', 'RENOIR', 'UNASSIGNED']) {
      const records = parseImport(JSON.stringify({ version: 2, records: [{ ...row, cat }] }));
      expect(records[0].catId).toBe(cat);
      expect(parseImport(exportRecords(records))).toEqual(records);
    }
  });
  it('validates every import before returning any records', () => {
    for (const grams of [-1, 10001, '12', null])
      expect(() =>
        parseImport(
          JSON.stringify({
            version: 2,
            records: [{ id: 'x', cat: 'MONET', type: 'FOOD', timestamp: 1, grams }],
          }),
        ),
      ).toThrow();
    const row = { id: 'x', cat: 'MONET', type: 'PEE', timestamp: 1, grams: null };
    expect(() => parseImport(JSON.stringify({ version: 2, records: [row, row] }))).toThrow(/重複/);
    expect(() =>
      parseImport(JSON.stringify({ version: 2, records: [{ ...row, cat: 'OTHER' }] })),
    ).toThrow();
    expect(() => parseImport(JSON.stringify({ version: 99, records: [] }))).toThrow();
  });
  it('uses Tokyo day/month boundaries on every device including year changes', () => {
    expect(dayKey(Date.parse('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    expect(monthRange('2027-01')).toEqual([
      Date.parse('2026-12-31T15:00:00Z'),
      Date.parse('2027-01-31T15:00:00Z'),
    ]);
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('retains tombstones during export and excludes them from totals', () => {
    const records = parseImport(
      JSON.stringify({
        version: 2,
        records: [{ id: 'x', cat: 'MONET', type: 'FOOD', timestamp: 1, grams: 3.5 }],
      }),
    );
    records[0].deletedAt = 0;
    expect(summarize(records).counts.FOOD).toBe(0);
    expect(parseImport(exportRecords(records))[0].deletedAt).toBe(0);
  });
});
