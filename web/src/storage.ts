import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { type CatRecord, validateRecord } from './model';

export interface Pending {
  scope: string;
  id: string;
  record: CatRecord;
  revision: string;
  kind: 'create' | 'create-edit' | 'edit';
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
  async put(scope: string, record: CatRecord, sync: boolean, create = false) {
    validateRecord(record);
    const db = await this.database;
    const tx = db.transaction(['records', 'pending'], 'readwrite');
    const old = await tx.objectStore('pending').get([scope, record.id]);
    await tx.objectStore('records').put({ scope, id: record.id, record });
    if (sync)
      await tx.objectStore('pending').put({
        scope,
        id: record.id,
        record,
        revision: crypto.randomUUID(),
        kind: old?.kind === 'create' ? 'create-edit' : (old?.kind ?? (create ? 'create' : 'edit')),
      });
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
  async merge(scope: string, records: CatRecord[]) {
    const db = await this.database;
    const tx = db.transaction(['records', 'pending'], 'readwrite');
    for (const record of records) {
      if (!(await tx.objectStore('pending').get([scope, record.id])))
        await tx.objectStore('records').put({ scope, id: record.id, record });
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
