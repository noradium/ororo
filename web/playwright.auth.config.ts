import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './tests/auth-browser',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    timeout: 30000,
    env: {
      VITE_FIREBASE_API_KEY: 'demo-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-ororo.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-ororo',
      VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef',
      VITE_USE_EMULATORS: 'true',
    },
  },
});
