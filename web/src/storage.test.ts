import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { LocalDatabase } from './storage';
import { RecordRepository } from './repository';
import type { CatRecord } from './model';
const record = (id = 'a'): CatRecord => ({
  id,
  catId: 'MONET',
  type: 'FOOD',
  grams: 12.5,
  occurredAt: 1,
  createdBy: 'uid',
  deletedAt: null,
});
const databases: LocalDatabase[] = [];
function database() {
  const db = new LocalDatabase(`test-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}
afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.close()));
});
it('persists independently scoped records without cross-account leakage', async () => {
  const db = database();
  await db.insert('family:alice:f1', record(), true);
  await db.insert('family:bob:f1', { ...record(), catId: 'RENOIR' }, true);
  expect((await db.records('family:alice:f1'))[0].catId).toBe('MONET');
  expect((await db.records('family:bob:f1'))[0].catId).toBe('RENOIR');
  expect(await db.records('local')).toEqual([]);
});
it('survives reopen and never duplicates an imported ID or resurrects a tombstone', async () => {
  const name = `test-${crypto.randomUUID()}`;
  const first = new LocalDatabase(name);
  await first.insert('local', record(), false);
  await first.put('local', { ...record(), deletedAt: 10 }, false);
  await first.close();
  const reopened = new LocalDatabase(name);
  databases.push(reopened);
  expect(await reopened.insert('local', record(), false)).toBe(false);
  expect((await reopened.records('local'))[0].deletedAt).toBe(10);
});
it('does not discard an edit arriving while a create is being sent', async () => {
  const db = database();
  await db.insert('s', record(), true);
  const sent = (await db.pending('s'))[0];
  await db.put('s', { ...record(), catId: 'RENOIR' }, true);
  await db.acknowledge(sent, record());
  expect((await db.pending('s'))[0].kind).toBe('create-edit');
  expect((await db.records('s'))[0].catId).toBe('RENOIR');
  await db.merge('s', [record()]);
  expect((await db.records('s'))[0].catId).toBe('RENOIR');
  const latest = (await db.pending('s'))[0];
  await db.acknowledge(latest, latest.record);
  expect(await db.pending('s')).toEqual([]);
});
it('keeps a deletion queued even if an older server response arrives', async () => {
  const db = database();
  await db.insert('s', record(), true);
  const sent = (await db.pending('s'))[0];
  await db.put('s', { ...record(), deletedAt: 42 }, true);
  await db.acknowledge(sent, record());
  expect((await db.pending('s'))[0].record.deletedAt).toBe(42);
  expect((await db.records('s'))[0].deletedAt).toBe(42);
});
it('local repository supports recording, reassignment, deletion and deduplicated imports', async () => {
  const db = database();
  const repo = new RecordRepository(db);
  await repo.add('MONET', 'POOP', null);
  await repo.add('RENOIR', 'FOOD', 0);
  const rows = await repo.exportAll();
  expect(rows).toHaveLength(2);
  expect(await repo.import(rows)).toBe(0);
  const poop = rows.find((r) => r.type === 'POOP')!;
  await repo.edit(poop.id, { catId: 'RENOIR' });
  await repo.edit(poop.id, { deletedAt: 10 });
  expect((await repo.exportAll()).find((r) => r.id === poop.id)).toMatchObject({
    catId: 'RENOIR',
    deletedAt: 10,
  });
  expect(await db.pending('local')).toEqual([]);
  repo.dispose();
});
