import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { loadAccess } from './scripts/access-config.mjs';

export default defineConfig(({ mode }) => ({
  define: { __ALLOWED_GOOGLE_EMAIL_HASHES__: JSON.stringify(loadAccess(mode).hashes) },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'firebase-store', test: /node_modules\/@firebase\/firestore\//, priority: 30 },
            { name: 'firebase-auth', test: /node_modules\/@firebase\/auth\//, priority: 20 },
            { name: 'vendor', test: /node_modules/, priority: 0 },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'おろろの記録 — モネとルノワール',
        short_name: 'おろろ',
        lang: 'ja',
        description: '家族でつける、ねこの小さな健康日記。',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#365e4e',
        background_color: '#f7f5ef',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // Firebase traffic is handled by the SDK; never cache auth/API responses here.
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
