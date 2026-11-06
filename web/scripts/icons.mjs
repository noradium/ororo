import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable.png', 512], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>body{margin:0;background:#365e4e}svg{width:100vw;height:100vh;display:block}</style>${svg}`);
    await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname }); await page.close();
  }
} finally { await browser.close(); }
