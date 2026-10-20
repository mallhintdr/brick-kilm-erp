import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// App version comes from the root package.json (bumped on every commit by .githooks/pre-commit).
const APP_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bhatta Manager',
        short_name: 'Bhatta Manager',
        description: 'Brick kiln operations: moulding, kiln lines, workers, peshgi, sales and cash book',
        start_url: '/',
        display: 'standalone',
        background_color: '#fdf6e9',
        theme_color: '#0f172a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // a new build takes over open tabs straight away instead of waiting for every tab to close
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // App shell (JS/CSS/HTML/font) is precached at build time, so the UI itself
        // loads with no network — not just the write-outbox this app already had.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Reads: try the network first (fresh data matters), but fall back to the
            // last-known response within 4s so screens still render while offline.
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkFirst',
            method: 'GET',
            options: { cacheName: 'api-get-cache', networkTimeoutSeconds: 4, expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5180,
    proxy: { '/api': { target: 'http://localhost:4000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
});
