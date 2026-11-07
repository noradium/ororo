import { test, expect } from '../helpers/session';
import { dayKey, monthRange, shiftMonth } from '../../src/model';

test('records eye pain per cat, persists it and updates the daily total and calendar', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'モネのおめめ痛々を記録', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('おめめ痛々');
  await expect(page.locator('.summary')).toContainText('おめめ痛々 1回');
  await expect(
    page.getByRole('button', { name: `${dayKey(Date.now())}、記録1件`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('.history-list')).toContainText('おめめ痛々');
  await page.locator('.cat-card.renoir').click();
  await expect(page.getByText('この日の記録はまだありません。')).toBeVisible();
  await expect(page.locator('.summary')).toContainText('おめめ痛々 0回');
  await page.getByRole('button', { name: 'ルノワールのおめめ痛々を記録', exact: true }).click();
  await expect(page.locator('.summary')).toContainText('おめめ痛々 1回');
});

test('opens an invitation received while the app is already running', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    location.hash = `invite=${'a'.repeat(43)}`;
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '家族に参加する' }),
  ).toBeVisible();
});

test('records each cat separately, validates food, survives reload and confirms deletion', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ねこの、いつもを。' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveText(/undefined/);
  await page.getByRole('button', { name: 'モネのうんちを記録', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('うんち');
  await page.locator('.cat-card.renoir').click();
  await expect(page.getByText('この日の記録はまだありません。')).toBeVisible();
  await page.getByRole('button', { name: 'ルノワールのご飯廃棄を記録', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('残っているご飯の量').fill('-1');
  await dialog.getByRole('button', { name: '記録する', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('0〜10000');
  await dialog.getByLabel('残っているご飯の量').fill('12.5');
  await dialog.getByRole('button', { name: '記録する', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.history-list')).toContainText('12.5 g');
  await page.reload();
  await expect(page.locator('.cat-card.renoir')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.history-list')).toContainText('12.5 g');
  await page.getByRole('button', { name: /ご飯廃棄を削除/ }).click();
  await dialog.getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.locator('.history-list')).toContainText('12.5 g');
  await page.getByRole('button', { name: /ご飯廃棄を削除/ }).click();
  await dialog.getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText('この日の記録はまだありません。')).toBeVisible();
  await page.locator('.cat-card.monet').click();
  await expect(page.locator('.history-list')).toContainText('うんち');
  await expect(page.locator('.history-list')).not.toContainText('ご飯廃棄');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: 'test-results/ororo-mobile.png', fullPage: true });
});

test('migrates legacy JSON, reassigns a cat and deduplicates repeat imports', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '保存・取り込み' }).click();
  const body = JSON.stringify({
    version: 1,
    records: [{ id: 'android-old', timestamp: Date.now(), type: 'PEE', grams: null }],
  });
  page.once('dialog', (d) => d.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'android.json',
    mimeType: 'application/json',
    buffer: Buffer.from(body),
  });
  await expect(page.getByRole('status').filter({ hasText: '1件を取り込みました' })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'android.json',
    mimeType: 'application/json',
    buffer: Buffer.from(body),
  });
  await expect(page.getByRole('status').filter({ hasText: '0件を取り込みました' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: /未分類の記録を振り分ける/ }).click();
  await expect(page.getByRole('button', { name: '未分類のうんちを記録' })).toBeDisabled();
  await page.getByRole('button', { name: '猫を選ぶ', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'ルノワール', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('おしっこ');
  await page.getByRole('button', { name: '保存・取り込み' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全記録をJSONに書き出す' }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.version).toBe(3);
  expect(exported.records).toHaveLength(1);
  expect(exported.records[0]).toMatchObject({ id: 'android-old', catId: 'RENOIR' });
});

test('opens historical months and shows per-cat calendar counts', async ({ page }) => {
  const month = shiftMonth(dayKey(Date.now()).slice(0, 7), -1);
  const timestamp = monthRange(month)[0] + 12 * 3600000;
  await page.goto('/');
  await page.getByRole('button', { name: '保存・取り込み' }).click();
  page.once('dialog', (d) => d.accept());
  await page.locator('input[type=file]').setInputFiles({
    name: 'history.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 2,
        records: [{ id: 'historical', cat: 'MONET', timestamp, type: 'VOMIT', grams: null }],
      }),
    ),
  });
  await expect(page.getByRole('status').filter({ hasText: '1件を取り込みました' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '前の月' }).click();
  await page.getByRole('button', { name: `${month}-01、記録1件`, exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('嘔吐');
  await page.locator('.cat-card.renoir').click();
  await expect(
    page.getByRole('button', { name: `${month}-01、記録0件`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('この日の記録はまだありません。')).toBeVisible();
});

test('installed service worker opens offline and persists a new record across offline reloads', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'モネのおしっこを記録', exact: true }).click();
  await expect(page.locator('.history-list')).toContainText('おしっこ');
  await page.reload();
  await expect(page.locator('.history-list')).toContainText('おしっこ');
  await context.setOffline(false);
});

test('keeps the signed-in diary responsive on desktop', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ねこの、いつもを。' })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/ororo-desktop.png', fullPage: true });
});
