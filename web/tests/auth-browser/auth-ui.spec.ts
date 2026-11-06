import { test, expect } from '@playwright/test';

// Drive the real browser SDK with Auth Emulator Google credentials. The Google
// chooser itself is covered separately by test:google-popup (requires Google JS).
test('restores a Google emulator session after reload and renders no password form', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '家族共有' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('パスワード', { exact: true })).toHaveCount(0);
  await page.evaluate(async (subject) => {
    const modulePath = '/node_modules/.vite/deps/firebase_auth.js';
    const { getAuth, GoogleAuthProvider, signInWithCredential } = await import(modulePath);
    const encode = (value: unknown) =>
      btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const now = Math.floor(Date.now() / 1000);
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: subject, email: `${subject}@gmail.com`, email_verified: true, name: 'Test Family', aud: 'demo-key', iss: 'https://accounts.google.com', iat: now, exp: now + 3600 })}.`;
    await signInWithCredential(getAuth(), GoogleAuthProvider.credential(token));
  }, crypto.randomUUID());
  await expect(dialog.getByRole('button', { name: 'ログアウト', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '新しい家族グループを作る' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '家族共有' }).click();
  await expect(dialog.getByRole('button', { name: 'ログアウト', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.getByRole('button', { name: '家族共有' }).click();
  await expect(dialog.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeVisible();
});
