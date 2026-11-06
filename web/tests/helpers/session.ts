import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export async function googleSession(request: APIRequestContext, email = 'ororo-browser@gmail.com') {
  const subject = crypto.randomUUID();
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const credential = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: subject, email, email_verified: true, name: 'Test Family', iss: 'https://accounts.google.com', aud: 'demo-key', iat: now, exp: now + 3600 })}.`;
  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key',
    {
      data: {
        postBody: `providerId=google.com&id_token=${encodeURIComponent(credential)}`,
        requestUri: 'http://localhost',
        returnSecureToken: true,
      },
    },
  );
  expect(response.ok()).toBe(true);
  const data = await response.json();
  return {
    uid: data.localId as string,
    email: data.email as string,
    emailVerified: true,
    isAnonymous: false,
    providerData: [
      {
        providerId: 'google.com',
        uid: subject,
        email: data.email,
        displayName: 'Test Family',
        photoURL: null,
        phoneNumber: null,
      },
    ],
    stsTokenManager: {
      refreshToken: data.refreshToken,
      accessToken: data.idToken,
      expirationTime: Date.now() + 3600000,
    },
    apiKey: 'demo-key',
    appName: '[DEFAULT]',
    createdAt: String(Date.now()),
    lastLoginAt: String(Date.now()),
  };
}
export async function seedSession(page: Page, session: Awaited<ReturnType<typeof googleSession>>) {
  await page.addInitScript((user) => {
    if (sessionStorage.getItem('ororo-test-seeded')) return;
    localStorage.setItem('firebase:authUser:demo-key:[DEFAULT]', JSON.stringify(user));
    // A known solo account cached from a prior online visit; Firestore is tested separately.
    localStorage.setItem(`ororo-family:${user.uid}`, 'null');
    sessionStorage.setItem('ororo-test-seeded', 'true');
  }, session);
}
export const test = base.extend({
  page: async ({ page, request }, use) => {
    await seedSession(page, await googleSession(request));
    await use(page);
  },
});
export { expect };
