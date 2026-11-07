export const CATS = {
  MONET: { name: 'モネ', breed: 'ブリティッシュショートヘアー', coat: 'グレー', color: '#e2e7eb' },
  RENOIR: { name: 'ルノワール', breed: 'ラガマフィン', coat: '白', color: '#f3e9da' },
  UNASSIGNED: { name: '未分類', breed: '以前の記録', coat: '', color: '#ece9e1' },
} as const;
export type CatId = keyof typeof CATS;
export const TYPES = {
  POOP: { label: 'うんち', symbol: '●', color: '#f0e4d7' },
  PEE: { label: 'おしっこ', symbol: '◆', color: '#e4eddb' },
  FOOD: { label: 'ご飯廃棄', symbol: '◒', color: '#f8e8c7' },
  VOMIT: { label: '嘔吐', symbol: '▲', color: '#f1ddda' },
  EYE_PAIN: { label: 'おめめ痛々', symbol: '◉', color: '#e8e1f0' },
} as const;
export type RecordType = keyof typeof TYPES;
export interface CatRecord {
  id: string;
  catId: CatId;
  type: RecordType;
  grams: number | null;
  occurredAt: number;
  createdBy: string;
  deletedAt: number | null;
}
export const TIME_ZONE = 'Asia/Tokyo';
export function dayKey(timestamp: number): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);
}
export function monthRange(month: string): [number, number] {
  const [y, m] = month.split('-').map(Number);
  return [Date.UTC(y, m - 1, 1) - 9 * 3600000, Date.UTC(y, m, 1) - 9 * 3600000];
}
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function validateRecord(value: unknown): CatRecord {
  const r = value as CatRecord;
  if (
    !r ||
    typeof r.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(r.id) ||
    !Object.hasOwn(CATS, r.catId) ||
    !Object.hasOwn(TYPES, r.type) ||
    !Number.isSafeInteger(r.occurredAt) ||
    r.occurredAt < 0 ||
    r.occurredAt >= 4102444800000 ||
    typeof r.createdBy !== 'string' ||
    r.createdBy.length > 128 ||
    !(r.deletedAt === null || (Number.isSafeInteger(r.deletedAt) && r.deletedAt >= 0))
  )
    throw new Error('記録の形式が正しくありません。');
  if (
    r.type === 'FOOD'
      ? typeof r.grams !== 'number' || !Number.isFinite(r.grams) || r.grams < 0 || r.grams > 10000
      : r.grams !== null
  )
    throw new Error('ご飯の残量が正しくありません。');
  return {
    id: r.id,
    catId: r.catId,
    type: r.type,
    grams: r.grams,
    occurredAt: r.occurredAt,
    createdBy: r.createdBy,
    deletedAt: r.deletedAt,
  };
}
export function parseImport(text: string): CatRecord[] {
  const root = JSON.parse(text);
  if (
    !root ||
    ![1, 2, 3].includes(root.version) ||
    !Array.isArray(root.records) ||
    root.records.length > 50000
  )
    throw new Error('対応していない記録ファイルです。');
  const ids = new Set<string>();
  return root.records.map((row: Record<string, unknown>) => {
    if (!row || typeof row !== 'object') throw new Error('記録の形式が正しくありません。');
    const record = validateRecord(
      root.version === 3
        ? row
        : {
            id: row.id,
            catId: root.version === 1 ? 'UNASSIGNED' : row.cat,
            type: row.type,
            grams: row.grams,
            occurredAt: row.timestamp,
            createdBy: 'import',
            deletedAt: null,
          },
    );
    if (ids.has(record.id)) throw new Error('記録IDが重複しています。');
    ids.add(record.id);
    return record;
  });
}
export function exportRecords(records: CatRecord[]): string {
  return JSON.stringify({ version: 3, timeZone: TIME_ZONE, records }, null, 2);
}
export function summarize(records: CatRecord[]) {
  const counts = { POOP: 0, PEE: 0, FOOD: 0, VOMIT: 0, EYE_PAIN: 0 };
  let grams = 0;
  for (const r of records)
    if (r.deletedAt === null) {
      counts[r.type]++;
      grams += r.grams ?? 0;
    }
  return { counts, grams: Math.round(grams * 100) / 100 };
}
