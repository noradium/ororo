import { renderAccessRules } from '../scripts/access-config.mjs';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import 'fake-indexeddb/auto';
import { LocalDatabase } from '../src/storage';
import { RecordRepository } from '../src/repository';

let env: RulesTestEnvironment;
const token = 'a'.repeat(43);
const db = (uid: string, verified = true): Firestore =>
  env
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: verified,
      firebase: { sign_in_provider: 'google.com' },
    })
    .firestore() as unknown as Firestore;
const event = (extra = {}) => ({
  catId: 'MONET',
  type: 'FOOD',
  grams: 12.5,
  occurredAt: Date.now(),
  createdBy: 'alice',
  createdAt: serverTimestamp(),
  updatedBy: 'alice',
  updatedAt: serverTimestamp(),
  deletedAt: null,
  ...extra,
});
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-ororo',
    firestore: {
      host: '127.0.0.1',
      port: 8089,
      rules: renderAccessRules(
        readFileSync('firestore.rules', 'utf8'),
        ['alice', 'bob', 'charlie', 'mallory', 'new-owner', 'stranger', 'outsider'].map(
          (uid) => `${uid}@example.com`,
        ),
      ),
    },
  });
}, 30000);
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await admin
      .doc('families/family')
      .set({ name: '家族', ownerId: 'alice', createdAt: new Date(), timeZone: 'Asia/Tokyo' });
    await admin
      .doc('families/family/members/alice')
      .set({ uid: 'alice', role: 'owner', createdAt: new Date() });
    await admin.doc('users/alice').set({ familyId: 'family' });
    await admin.doc(`invites/${token}`).set({
      familyId: 'family',
      createdBy: 'alice',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      usedBy: null,
    });
  });
});
function join(client: Firestore, uid: string, invite = token, role = 'member') {
  const batch = writeBatch(client);
  batch.set(doc(client, 'families/family/members', uid), {
    uid,
    role,
    createdAt: serverTimestamp(),
    inviteId: invite,
  });
  batch.set(doc(client, 'users', uid), { familyId: 'family' });
  batch.update(doc(client, 'invites', invite), { usedBy: uid });
  return batch.commit();
}
it('denies outsiders, anonymous users and unverified email accounts', async () => {
  await assertSucceeds(getDoc(doc(db('alice'), 'families/family')));
  await assertFails(getDoc(doc(db('outsider'), 'families/family')));
  await assertFails(getDoc(doc(db('alice', false), 'families/family')));
  await assertFails(
    getDoc(
      doc(env.unauthenticatedContext().firestore() as unknown as Firestore, 'families/family'),
    ),
  );
  await assertFails(
    setDoc(
      doc(db('outsider'), 'families/family/records/x'),
      event({ createdBy: 'outsider', updatedBy: 'outsider' }),
    ),
  );
});
it('creates a family only with its owner membership and user pointer atomically', async () => {
  const client = db('new-owner');
  const batch = writeBatch(client);
  batch.set(doc(client, 'families/new'), {
    name: '新しい家族',
    ownerId: 'new-owner',
    timeZone: 'Asia/Tokyo',
    createdAt: serverTimestamp(),
  });
  batch.set(doc(client, 'families/new/members/new-owner'), {
    uid: 'new-owner',
    role: 'owner',
    createdAt: serverTimestamp(),
  });
  batch.set(doc(client, 'users/new-owner'), { familyId: 'new' });
  await assertSucceeds(batch.commit());
  await assertFails(
    setDoc(doc(db('stranger'), 'families/incomplete'), {
      name: '家族',
      ownerId: 'stranger',
      timeZone: 'Asia/Tokyo',
      createdAt: serverTimestamp(),
    }),
  );
  await assertFails(updateDoc(doc(client, 'users/new-owner'), { familyId: 'family' }));
});
it('accepts a single-use invitation and rejects reuse or role escalation', async () => {
  await assertFails(join(db('mallory'), 'mallory', token, 'owner'));
  await assertSucceeds(join(db('bob'), 'bob'));
  await assertSucceeds(getDoc(doc(db('bob'), 'families/family')));
  await assertFails(join(db('charlie'), 'charlie'));
  await assertFails(updateDoc(doc(db('bob'), 'families/family/members/bob'), { role: 'owner' }));
});
it('rejects expired invitations and membership creation without claiming', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc(`invites/${token}`)
      .update({ expiresAt: new Date(0) });
  });
  await assertFails(join(db('bob'), 'bob'));
  await assertFails(
    setDoc(doc(db('bob'), 'families/family/members/bob'), {
      uid: 'bob',
      role: 'member',
      createdAt: serverTimestamp(),
      inviteId: token,
    }),
  );
});
it('only the owner creates invitations and tokens cannot be listed', async () => {
  const data = {
    familyId: 'family',
    createdBy: 'alice',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 86400000),
    usedBy: null,
  };
  await assertSucceeds(setDoc(doc(db('alice'), 'invites', 'b'.repeat(43)), data));
  await assertFails(
    setDoc(doc(db('outsider'), 'invites', 'c'.repeat(43)), { ...data, createdBy: 'outsider' }),
  );
  await assertFails(getDocs(collection(db('alice'), 'invites')));
  await assertFails(updateDoc(doc(db('bob'), 'invites', token), { usedBy: 'bob' }));
});
it('validates record fields, identity, grams and immutable occurrence data', async () => {
  const client = db('alice');
  const ref = doc(client, 'families/family/records/x');
  await assertSucceeds(setDoc(ref, event()));
  await assertSucceeds(
    setDoc(doc(client, 'families/family/records/eye'), event({ type: 'EYE_PAIN', grams: null })),
  );
  await assertFails(
    setDoc(doc(client, 'families/family/records/eye-bad'), event({ type: 'EYE_PAIN', grams: 1 })),
  );
  await assertFails(setDoc(doc(client, 'families/family/records/bad'), event({ catId: 'OTHER' })));
  await assertFails(setDoc(doc(client, 'families/family/records/bad'), event({ grams: -1 })));
  await assertFails(
    setDoc(doc(client, 'families/family/records/bad'), event({ createdBy: 'bob' })),
  );
  await assertFails(updateDoc(ref, { occurredAt: 1, updatedAt: serverTimestamp() }));
  await assertSucceeds(
    updateDoc(ref, { catId: 'RENOIR', updatedBy: 'alice', updatedAt: serverTimestamp() }),
  );
});
it('shares records with members, enforces revocation and prevents tombstone resurrection', async () => {
  const alice = db('alice');
  await assertSucceeds(join(db('bob'), 'bob'));
  const ref = doc(alice, 'families/family/records/x');
  await setDoc(ref, event());
  const bob = db('bob');
  await assertSucceeds(getDoc(doc(bob, 'families/family/records/x')));
  await assertSucceeds(
    updateDoc(doc(bob, 'families/family/records/x'), {
      deletedAt: serverTimestamp(),
      updatedBy: 'bob',
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(ref, { deletedAt: null, updatedBy: 'alice', updatedAt: serverTimestamp() }),
  );
  await assertFails(deleteDoc(ref));
  await assertSucceeds(deleteDoc(doc(alice, 'families/family/members/bob')));
  await assertFails(getDoc(doc(bob, 'families/family/records/x')));
  await assertFails(deleteDoc(doc(alice, 'families/family/members/alice')));
});
it('syncs two independent device outboxes with idempotent retries and deletion-wins behavior', async () => {
  await join(db('bob'), 'bob');
  const localA = new LocalDatabase(`device-a-${crypto.randomUUID()}`);
  const localB = new LocalDatabase(`device-b-${crypto.randomUUID()}`);
  const a = new RecordRepository(localA, { db: db('alice'), uid: 'alice', familyId: 'family' });
  const b = new RecordRepository(localB, { db: db('bob'), uid: 'bob', familyId: 'family' });
  try {
    const record = {
      id: 'shared',
      catId: 'MONET' as const,
      type: 'FOOD' as const,
      grams: 0,
      occurredAt: Date.now(),
      createdBy: 'alice',
      deletedAt: null,
    };
    await localA.insert(a.scope, record, true);
    await a.flush();
    expect(await localA.pending(a.scope)).toEqual([]);
    const received = await b.exportAll();
    expect(received[0]).toMatchObject({ id: 'shared', grams: 0, catId: 'MONET' });
    await localB.put(b.scope, { ...received[0], catId: 'RENOIR' }, true);
    await b.flush();
    expect((await a.exportAll())[0].catId).toBe('RENOIR');
    const latest = (await a.exportAll())[0];
    await localA.put(a.scope, { ...latest, deletedAt: Date.now() }, true);
    await a.flush();
    // An offline edit from another device cannot resurrect a deleted record.
    await localB.put(b.scope, { ...received[0], catId: 'MONET' }, true);
    await b.flush();
    expect((await b.exportAll())[0].deletedAt).not.toBeNull();
    expect(await localB.pending(b.scope)).toEqual([]);
    await localA.insert(a.scope, { ...record, id: 'retry' }, true);
    const pending = (await localA.pending(a.scope))[0];
    await a.flush();
    await localA.put(a.scope, pending.record, true, true);
    await a.flush();
    expect((await a.exportAll()).filter((r) => r.id === 'retry')).toHaveLength(1);
  } finally {
    a.dispose();
    b.dispose();
    await localA.close();
    await localB.close();
  }
}, 30000);

it('denies an unlisted Google account even with a pre-existing membership', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc('families/family/members/denied')
      .set({ uid: 'denied', role: 'member', createdAt: new Date() });
  });
  await assertFails(getDoc(doc(db('denied'), 'families/family')));
});
