import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { type CatRecord, type RecordChanges, validateRecord } from './model';

export interface Pending {
  scope: string;
  id: string;
  record: CatRecord;
  revision: string;
  kind: 'create' | 'create-edit' | 'edit';
  changes?: RecordChanges;
}
export function pendingChanges(pending: Pending): RecordChanges {
  if (pending.kind === 'create') return {};
  // Older queued edits saved the record without tracking the fields that changed.
  return pending.changes ?? { catId: pending.record.catId, deletedAt: pending.record.deletedAt };
}
interface Database extends DBSchema {
  records: {
    key: [string, string];
    value: { scope: string; id: string; record: CatRecord };
    indexes: { scope: string };
  };
  pending: { key: [string, string]; value: Pending; indexes: { scope: string } };
}
export class LocalDatabase {
  private database: Promise<IDBPDatabase<Database>>;
  constructor(name = 'ororo-family-v1') {
    this.database = openDB<Database>(name, 1, {
      upgrade(db) {
        db.createObjectStore('records', { keyPath: ['scope', 'id'] }).createIndex('scope', 'scope');
        db.createObjectStore('pending', { keyPath: ['scope', 'id'] }).createIndex('scope', 'scope');
      },
    });
  }
  async records(scope: string) {
    return (await (await this.database).getAllFromIndex('records', 'scope', scope)).map(
      (r) => r.record,
    );
  }
  async pending(scope: string) {
    return (await this.database).getAllFromIndex('pending', 'scope', scope);
  }
  async update(scope: string, id: string, changes: RecordChanges, sync: boolean) {
    const db = await this.database;
    const tx = db.transaction(['records', 'pending'], 'readwrite');
    const records = tx.objectStore('records');
    const pending = tx.objectStore('pending');
    const current = await records.get([scope, id]);
    if (!current || current.record.deletedAt !== null)
      throw new Error('変更する記録が見つかりません。');
    const record = validateRecord({ ...current.record, ...changes });
    await records.put({ scope, id, record });
    if (sync) {
      const old = await pending.get([scope, id]);
      await pending.put({
        scope,
        id,
        record,
        revision: crypto.randomUUID(),
        kind: old?.kind === 'create' ? 'create-edit' : (old?.kind ?? 'edit'),
        changes: { ...(old && pendingChanges(old)), ...changes },
      });
    }
    await tx.done;
  }
  async insert(scope: string, record: CatRecord, sync: boolean): Promise<boolean> {
    validateRecord(record);
    const db = await this.database;
    const tx = db.transaction(['records', 'pending'], 'readwrite');
    if (await tx.objectStore('records').get([scope, record.id])) {
      await tx.done;
      return false;
    }
    await tx.objectStore('records').put({ scope, id: record.id, record });
    if (sync)
      await tx
        .objectStore('pending')
        .put({ scope, id: record.id, record, revision: crypto.randomUUID(), kind: 'create' });
    await tx.done;
    return true;
  }
  async merge(scope: string, records: CatRecord[], range?: [number, number]) {
    const db = await this.database;
    const tx = db.transaction(['records', 'pending'], 'readwrite');
    const stored = tx.objectStore('records');
    const pending = tx.objectStore('pending');
    if (range) {
      const [start, end] = range;
      const ids = new Set(records.map((record) => record.id));
      for (const { id, record } of await stored.index('scope').getAll(scope)) {
        // A date correction can move a record out of the server's monthly query.
        if (
          record.occurredAt >= start &&
          record.occurredAt < end &&
          !ids.has(id) &&
          !(await pending.get([scope, id]))
        )
          await stored.delete([scope, id]);
      }
    }
    for (const record of records) {
      if (!(await pending.get([scope, record.id])))
        await stored.put({ scope, id: record.id, record });
    }
    await tx.done;
  }
  async acknowledge(pending: Pending, canonical: CatRecord) {
    const db = await this.database;
    const tx = db.transaction(['records', 'pending'], 'readwrite');
    const current = await tx.objectStore('pending').get([pending.scope, pending.id]);
    if (current?.revision === pending.revision) {
      await tx.objectStore('pending').delete([pending.scope, pending.id]);
      await tx
        .objectStore('records')
        .put({ scope: pending.scope, id: pending.id, record: canonical });
    }
    await tx.done;
  }
  async close() {
    (await this.database).close();
  }
}
