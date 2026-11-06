import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
  getDocs,
  type Firestore,
  type DocumentData,
} from 'firebase/firestore';
import { LocalDatabase, type Pending } from './storage';
import { type CatRecord, type CatId, type RecordType, monthRange, validateRecord } from './model';

export interface Remote {
  db: Firestore;
  uid: string;
  familyId: string;
}
export interface StoreState {
  scope: string;
  records: CatRecord[];
  pending: number;
  error: string;
  connected: boolean;
}
function decode(id: string, data: DocumentData): CatRecord {
  return validateRecord({ id, ...data, deletedAt: data.deletedAt?.toMillis() ?? null });
}
export class RecordRepository {
  readonly scope: string;
  private listeners = new Set<(state: StoreState) => void>();
  private stopSnapshot?: () => void;
  private syncing = false;
  private disposed = false;
  private error = '';
  private connected = false;
  private generation = 0;
  private onOnline = () => {
    void this.flush();
  };
  constructor(
    private local: LocalDatabase,
    readonly remote?: Remote,
    private localUid?: string,
  ) {
    this.scope = remote
      ? `family:${remote.uid}:${remote.familyId}`
      : localUid
        ? `local:${localUid}`
        : 'local';
    if (typeof window !== 'undefined') window.addEventListener('online', this.onOnline);
  }
  subscribe(listener: (state: StoreState) => void) {
    this.listeners.add(listener);
    void this.emit();
    return () => {
      this.listeners.delete(listener);
    };
  }
  private async emit() {
    try {
      const state = {
        scope: this.scope,
        records: await this.local.records(this.scope),
        pending: (await this.local.pending(this.scope)).length,
        error: this.error,
        connected: this.connected,
      };
      if (!this.disposed) for (const listener of this.listeners) listener(state);
    } catch {
      for (const listener of this.listeners)
        listener({
          scope: this.scope,
          records: [],
          pending: 0,
          error: '端末に保存できません。ブラウザーのストレージ設定と空き容量を確認してください。',
          connected: false,
        });
    }
  }
  async watchMonth(month: string) {
    const generation = ++this.generation;
    this.stopSnapshot?.();
    this.connected = false;
    await this.emit();
    if (!this.remote || this.disposed || generation !== this.generation) return;
    const [start, end] = monthRange(month);
    const source = query(
      collection(this.remote.db, 'families', this.remote.familyId, 'records'),
      where('occurredAt', '>=', start),
      where('occurredAt', '<', end),
    );
    this.stopSnapshot = onSnapshot(
      source,
      { includeMetadataChanges: true },
      async (snapshot) => {
        if (this.disposed || generation !== this.generation) return;
        try {
          await this.local.merge(
            this.scope,
            snapshot.docs.map((d) => decode(d.id, d.data())),
          );
          this.connected = !snapshot.metadata.fromCache;
          this.error = '';
          await this.emit();
        } catch {
          this.error = '共有データを端末に保存できませんでした。';
          await this.emit();
        }
      },
      () => {
        this.connected = false;
        this.error = '共有データを読めません。通信状態や家族の参加権限を確認してください。';
        void this.emit();
      },
    );
    void this.flush();
  }
  async add(catId: CatId, type: RecordType, grams: number | null) {
    if (catId === 'UNASSIGNED') throw new Error('記録する猫を選んでください。');
    const record = validateRecord({
      id: crypto.randomUUID(),
      catId,
      type,
      grams,
      occurredAt: Date.now(),
      createdBy: this.remote?.uid ?? 'local',
      deletedAt: null,
    });
    await this.local.insert(this.scope, record, !!this.remote);
    await this.emit();
    void this.flush();
  }
  async edit(id: string, changes: { catId?: CatId; deletedAt?: number }) {
    const record = (await this.local.records(this.scope)).find((r) => r.id === id);
    if (!record || record.deletedAt !== null) throw new Error('変更する記録が見つかりません。');
    await this.local.put(this.scope, { ...record, ...changes }, !!this.remote);
    await this.emit();
    void this.flush();
  }
  async import(records: CatRecord[]) {
    let inserted = 0;
    for (const record of records) {
      const r = { ...record, createdBy: this.remote?.uid ?? 'local' };
      if (await this.local.insert(this.scope, r, !!this.remote)) inserted++;
    }
    await this.emit();
    void this.flush();
    return inserted;
  }
  async localRecords() {
    const legacy = await this.local.records('local');
    const uid = this.remote?.uid ?? this.localUid;
    const personal = uid ? await this.local.records(`local:${uid}`) : [];
    return [...new Map([...legacy, ...personal].map((record) => [record.id, record])).values()];
  }
  async exportAll(): Promise<CatRecord[]> {
    if (this.remote) {
      // An explicit full export, not just the months that have been viewed.
      const snapshot = await getDocs(
        collection(this.remote.db, 'families', this.remote.familyId, 'records'),
      );
      if (snapshot.metadata.fromCache)
        throw new Error('全件の書き出しにはインターネット接続が必要です。');
      await this.local.merge(
        this.scope,
        snapshot.docs.map((d) => decode(d.id, d.data())),
      );
    }
    return this.local.records(this.scope);
  }
  async flush() {
    if (
      !this.remote ||
      this.syncing ||
      this.disposed ||
      (typeof navigator !== 'undefined' && !navigator.onLine)
    )
      return;
    this.syncing = true;
    this.error = '';
    try {
      while (!this.disposed) {
        const pending = (await this.local.pending(this.scope))[0];
        if (!pending) break;
        const canonical = await this.send(pending);
        await this.local.acknowledge(pending, canonical);
        await this.emit();
      }
    } catch {
      this.error =
        '未送信の記録を端末に保管しています。通信・参加権限・無料枠を確認して再送してください。';
    } finally {
      this.syncing = false;
      await this.emit();
    }
  }
  private async send(pending: Pending): Promise<CatRecord> {
    const remote = this.remote!;
    const ref = doc(remote.db, 'families', remote.familyId, 'records', pending.id);
    return runTransaction(remote.db, async (tx) => {
      const snapshot = await tx.get(ref);
      const r = pending.record;
      if (snapshot.exists()) {
        const existing = decode(snapshot.id, snapshot.data());
        // Import/retry cannot overwrite an existing ID. Tombstones always win.
        if (pending.kind === 'create' || existing.deletedAt !== null) return existing;
        tx.update(ref, {
          catId: r.catId,
          deletedAt: r.deletedAt !== null ? serverTimestamp() : null,
          updatedBy: remote.uid,
          updatedAt: serverTimestamp(),
        });
        return { ...existing, catId: r.catId, deletedAt: r.deletedAt };
      }
      if (pending.kind === 'edit') throw new Error('元の記録が見つかりません。');
      tx.set(ref, {
        catId: r.catId,
        type: r.type,
        grams: r.grams,
        occurredAt: r.occurredAt,
        createdBy: remote.uid,
        createdAt: serverTimestamp(),
        updatedBy: remote.uid,
        updatedAt: serverTimestamp(),
        deletedAt: r.deletedAt !== null ? serverTimestamp() : null,
      });
      return { ...r, createdBy: remote.uid };
    });
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.stopSnapshot?.();
    this.listeners.clear();
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onOnline);
  }
}
