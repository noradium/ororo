import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  doc,
  getDoc,
  writeBatch,
  serverTimestamp,
  collection,
  Timestamp,
  runTransaction,
  setDoc,
} from 'firebase/firestore';

const env = import.meta.env;
export const configured = !!(
  env.VITE_FIREBASE_API_KEY &&
  env.VITE_FIREBASE_AUTH_DOMAIN &&
  env.VITE_FIREBASE_PROJECT_ID &&
  env.VITE_FIREBASE_APP_ID
);
const app = configured
  ? initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })
  : null;
// Keep Google sign-in across reloads, including redirect returns from iOS PWAs.
export const auth = app
  ? initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  : null;
export const firestore = app ? getFirestore(app) : null;
if (env.DEV && env.VITE_USE_EMULATORS === 'true' && auth && firestore) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8089);
}
export interface Family {
  id: string;
  name: string;
  ownerId: string;
}
export async function loadFamily(uid: string): Promise<Family | null> {
  const user = await getDoc(doc(firestore!, 'users', uid));
  if (!user.exists()) return null;
  const family = await getDoc(doc(firestore!, 'families', user.data().familyId));
  if (!family.exists()) throw new Error('家族グループが見つかりません。');
  return { id: family.id, ...family.data() } as Family;
}
export async function createFamily(uid: string, name: string): Promise<Family> {
  const family = doc(collection(firestore!, 'families'));
  const batch = writeBatch(firestore!);
  batch.set(family, { name, ownerId: uid, timeZone: 'Asia/Tokyo', createdAt: serverTimestamp() });
  batch.set(doc(family, 'members', uid), { uid, role: 'owner', createdAt: serverTimestamp() });
  batch.set(doc(firestore!, 'users', uid), { familyId: family.id });
  await batch.commit();
  return { id: family.id, name, ownerId: uid };
}
export function inviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export async function createInvite(familyId: string, uid: string): Promise<string> {
  const token = inviteToken();
  await setDoc(doc(firestore!, 'invites', token), {
    familyId,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 6 * 86400000),
    usedBy: null,
  });
  // Fragment is not sent to the host or in HTTP referrers.
  return `${location.origin}/#invite=${token}`;
}
export async function joinFamily(uid: string, token: string): Promise<Family> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('招待リンクの形式が正しくありません。');
  await runTransaction(firestore!, async (tx) => {
    const ref = doc(firestore!, 'invites', token);
    const invitation = await tx.get(ref);
    if (!invitation.exists()) throw new Error('招待リンクが見つかりません。');
    const data = invitation.data();
    if (data.usedBy || data.expiresAt.toMillis() <= Date.now())
      throw new Error('この招待リンクは使用済みか、期限が切れています。');
    tx.set(doc(firestore!, 'families', data.familyId, 'members', uid), {
      uid,
      role: 'member',
      createdAt: serverTimestamp(),
      inviteId: token,
    });
    tx.set(doc(firestore!, 'users', uid), { familyId: data.familyId });
    tx.update(ref, { usedBy: uid });
  });
  const family = await loadFamily(uid);
  if (!family) throw new Error('家族グループを読み込めませんでした。');
  return family;
}
