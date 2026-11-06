import { test, expect } from '@playwright/test';
import { googleSession, seedSession } from '../helpers/session';

test('shows only the welcome page, even with cached records and during session restoration', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const audit = { leaked: false };
    Object.assign(window, { __diaryAudit: audit });
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="日別の記録"]')) audit.leaked = true;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'おろろ', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'グレーの猫と白い猫のイラスト' })).toBeVisible();
  const title = await page.getByRole('heading', { name: 'おろろ', exact: true }).boundingBox();
  expect(title!.height).toBeLessThan(110);
  const card = await page.locator('.welcome-card').boundingBox();
  expect(Math.abs(card!.x + card!.width / 2 - 195)).toBeLessThan(2);
  await expect(page.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('ororo-family-v1', 1);
      open.onupgradeneeded = () => {
        open.result
          .createObjectStore('records', { keyPath: ['scope', 'id'] })
          .createIndex('scope', 'scope');
        open.result
          .createObjectStore('pending', { keyPath: ['scope', 'id'] })
          .createIndex('scope', 'scope');
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put({
          scope: 'local',
          id: 'cached-secret',
          record: {
            id: 'cached-secret',
            catId: 'MONET',
            type: 'FOOD',
            grams: 8765,
            occurredAt: Date.now(),
            createdBy: 'local',
            deletedAt: null,
          },
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeEnabled();
  await expect(
    page.locator('.cat-selector, .calendar-section, .history-section, dialog'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __diaryAudit: { leaked: boolean } }).__diaryAudit.leaked,
    ),
  ).toBe(false);
  await page.screenshot({ path: 'test-results/ororo-welcome.png', fullPage: true });
});

test('allows an approved Google user, retains login and hides open record dialogs immediately on signout', async ({
  page,
  request,
}) => {
  await seedSession(page, await googleSession(request));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ねこの、いつもを。' })).toBeVisible();
  await page.getByRole('button', { name: 'モネのうんちを記録', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('うんち');
  await page.reload();
  await expect(page.locator('.history-list')).toContainText('うんち');
  await page.getByRole('button', { name: '保存・取り込み' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = '/node_modules/.vite/deps/firebase_auth.js';
    const { getAuth, signOut } = await import(modulePath);
    await signOut(getAuth());
  });
  await expect(page.getByRole('heading', { name: 'おろろ', exact: true })).toBeVisible();
  await expect(page.locator('dialog,.history-list,.record-grid,.calendar-section')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'おろろ', exact: true })).toBeVisible();
});

test('rejects an unlisted Google account and never mounts the diary', async ({ page, request }) => {
  await seedSession(page, await googleSession(request, 'not-allowed@gmail.com'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('このGoogleアカウントでは利用できません');
  await expect(page.locator('.record-grid,.calendar-section,.history-section')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      indexedDB.databases().then((dbs) => dbs.some((db) => db.name === 'ororo-family-v1')),
    ),
  ).toBe(false);
});

test('another approved account cannot see the previous solo account records', async ({
  page,
  request,
}) => {
  await seedSession(page, await googleSession(request));
  await page.goto('/');
  await page.getByRole('button', { name: 'モネのうんちを記録', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('うんち');
  await page.getByRole('button', { name: '家族共有' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'おろろ', exact: true })).toBeVisible();
  const other = await googleSession(request, 'ororo-other@gmail.com');
  await page.evaluate((user) => {
    localStorage.setItem('firebase:authUser:demo-key:[DEFAULT]', JSON.stringify(user));
    localStorage.setItem(`ororo-family:${user.uid}`, 'null');
  }, other);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ねこの、いつもを。' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'モネのうんちを記録', exact: true })).toBeEnabled();
  await expect(page.getByText('この日の記録はまだありません。')).toBeVisible();
});
