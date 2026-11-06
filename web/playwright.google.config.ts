import { defineConfig } from '@playwright/test';
import base from './playwright.auth.config';
export default defineConfig({ ...base, testDir: './tests/google-popup' });
