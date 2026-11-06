import { afterAll, expect, it } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithCredential,
  linkWithCredential,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  signOut,
} from 'firebase/auth';

const app = initializeApp(
  { apiKey: 'demo-key', projectId: 'demo-ororo', authDomain: 'demo-ororo.firebaseapp.com' },
  'google-auth-test',
);
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
afterAll(() => deleteApp(app));
// Unsigned tokens are supported ONLY by the local Auth Emulator, not by production Google auth.
function google(subject: string, email: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return GoogleAuthProvider.credential(
    `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: subject,
      email,
      email_verified: true,
      name: 'テストの家族',
      iss: 'https://accounts.google.com',
      aud: 'demo-key',
      iat: now,
      exp: now + 3600,
    })}.`,
  );
}
it('signs in with Google, exposes a verified claim and keeps the UID across sign-ins', async () => {
  const subject = crypto.randomUUID();
  const credential = google(subject, `${subject}@gmail.com`);
  const first = await signInWithCredential(auth, credential);
  expect(first.user.emailVerified).toBe(true);
  expect(first.user.providerData.some((p) => p.providerId === 'google.com')).toBe(true);
  expect((await getIdTokenResult(first.user, true)).claims.email_verified).toBe(true);
  await signOut(auth);
  expect(auth.currentUser).toBeNull();
  const again = await signInWithCredential(auth, credential);
  expect(again.user.uid).toBe(first.user.uid);
});
it('links Google to an existing password account without changing its data identity', async () => {
  await signOut(auth);
  const subject = crypto.randomUUID();
  const email = `${subject}@gmail.com`;
  const legacy = await createUserWithEmailAndPassword(auth, email, 'legacy-test-password');
  const linked = await linkWithCredential(legacy.user, google(subject, email));
  expect(linked.user.uid).toBe(legacy.user.uid);
  expect(linked.user.emailVerified).toBe(true);
  expect(linked.user.providerData.some((p) => p.providerId === 'google.com')).toBe(true);
  await signOut(auth);
  const again = await signInWithCredential(auth, google(subject, email));
  expect(again.user.uid).toBe(legacy.user.uid);
});
