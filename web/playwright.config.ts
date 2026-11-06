import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH === 'playwright'
          ? undefined
          : process.env.CHROME_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      ALLOWED_GOOGLE_EMAILS: 'ororo-browser@gmail.com,ororo-other@gmail.com',
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-ororo.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-ororo',
      VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
      VITE_USE_EMULATORS: 'true',
    },
  },
});
