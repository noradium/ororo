import { test, expect, type Page } from '@playwright/test';

async function chooseGoogle(page: Page, email: string) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click();
  const popup = await opened;
  await popup.getByText('Add new account', { exact: true }).click();
  await popup.locator('#email-input').fill(email);
  await popup.locator('#display-name-input').fill('テストの家族');
  await popup.locator('button[type=submit]').click();
}

test('logs in with Google, preserves login after reload and offers no password form', async ({
  page,
}) => {
  const email = 'ororo-browser@gmail.com';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'おろろ', exact: true })).toBeVisible();
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新規登録', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '家族共有' })).toHaveCount(0);
  await chooseGoogle(page, email);
  await expect(page.getByRole('heading', { name: 'ねこの、いつもを。' })).toBeVisible();
  await page.getByRole('button', { name: '家族共有' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'ログアウト', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '新しい家族グループを作る' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '家族共有' }).click();
  await expect(dialog.getByRole('button', { name: 'ログアウト', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'おろろ', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '家族共有' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeVisible();
});

test('closing the Google popup keeps the welcome login usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'おろろ', exact: true })).toBeVisible();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click();
  const popup = await opened;
  await expect(popup.getByText('Add new account', { exact: true })).toBeVisible();
  await popup.close();
  // Firebase polls closure every 2s (10s on mobile), then waits another 8s
  // for a possibly in-flight auth event before reporting popup-closed-by-user.
  // Keep the assertions; only this asynchronous SDK result needs a longer wait.
  await expect(page.getByRole('alert')).toContainText('キャンセル', { timeout: 20000 });
  await expect(page.locator('.record-grid,.calendar-section')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeEnabled();
});
