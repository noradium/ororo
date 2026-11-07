import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore';
import { LocalDatabase } from './storage';
import { RecordRepository } from './repository';

// Keep the actual IndexedDB queue and acknowledgements; stub only the cloud RPC.
const cloud = vi.hoisted(() => ({ set: vi.fn(), transaction: vi.fn() }));
vi.mock('firebase/firestore', async (original) => ({
  ...(await original<typeof import('firebase/firestore')>()),
  doc: vi.fn((_db, ...path: string[]) => ({ path: path.join('/') })),
  runTransaction: cloud.transaction,
}));
const open: { local: LocalDatabase; repo: RecordRepository }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  cloud.transaction.mockImplementation(async (_db, update) =>
    update({
      get: async () => ({ exists: () => false }),
      set: cloud.set,
    }),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const { local, repo } of open.splice(0)) {
    repo.dispose();
    await local.close();
  }
});
async function queued() {
  const local = new LocalDatabase(`rpc-test-${crypto.randomUUID()}`);
  const repo = new RecordRepository(local, {
    db: {} as Firestore,
    uid: 'alice',
    familyId: 'family',
  });
  open.push({ local, repo });
  await local.insert(
    repo.scope,
    {
      id: 'shared',
      catId: 'MONET',
      type: 'FOOD',
      grams: 0,
      occurredAt: Date.now(),
      createdBy: 'alice',
      deletedAt: null,
    },
    true,
  );
  return { local, repo };
}
it('drains the outbox when Node provides navigator without onLine', async () => {
  vi.stubGlobal('navigator', {});
  const { local, repo } = await queued();
  await repo.flush();
  expect(cloud.set).toHaveBeenCalledWith(
    { path: 'families/family/records/shared' },
    expect.objectContaining({ grams: 0, createdBy: 'alice' }),
  );
  expect(await local.pending(repo.scope)).toEqual([]);
});
it('drains the outbox when navigator is absent', async () => {
  vi.stubGlobal('navigator', undefined);
  const { local, repo } = await queued();
  await repo.flush();
  expect(cloud.set).toHaveBeenCalledTimes(1);
  expect(await local.pending(repo.scope)).toEqual([]);
});
it('retains records only while explicitly offline and sends them once online', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const { local, repo } = await queued();
  await repo.flush();
  expect(cloud.transaction).not.toHaveBeenCalled();
  expect(await local.pending(repo.scope)).toHaveLength(1);
  vi.stubGlobal('navigator', { onLine: true });
  await repo.flush();
  expect(await local.pending(repo.scope)).toEqual([]);
});
it('keeps the outbox when the server rejects a write', async () => {
  vi.stubGlobal('navigator', {});
  cloud.transaction.mockRejectedValueOnce(new Error('permission-denied'));
  const { local, repo } = await queued();
  await repo.flush();
  expect(cloud.transaction).toHaveBeenCalledTimes(1);
  expect(await local.pending(repo.scope)).toHaveLength(1);
});
