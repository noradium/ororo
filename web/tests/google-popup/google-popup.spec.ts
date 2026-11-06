import { test, expect, type Page } from '@playwright/test';

async function chooseGoogle(page: Page, email: string) {
  const opened = page.waitForEvent('popup');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Googleでログイン', exact: true })
    .click();
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
  await page.getByRole('button', { name: '家族共有' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('パスワード', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '新規登録', exact: true })).toHaveCount(0);
  await chooseGoogle(page, email);
  await expect(dialog.getByRole('button', { name: 'ログアウト', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '新しい家族グループを作る' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '家族共有' }).click();
  await expect(dialog.getByRole('button', { name: 'ログアウト', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await page.getByRole('button', { name: '家族共有' }).click();
  await expect(dialog.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeVisible();
});

test('closing the Google popup keeps the login dialog usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '家族共有' }).click();
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Googleでログイン', exact: true }).click();
  const popup = await opened;
  await popup.close();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('キャンセル');
  await expect(page.getByRole('button', { name: 'Googleでログイン', exact: true })).toBeEnabled();
});
