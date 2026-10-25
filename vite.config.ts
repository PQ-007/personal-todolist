/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Calpis',
        short_name: 'Calpis',
        description: 'Weekly planner backed by Google Calendar',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0e1322',
        theme_color: '#0e1322',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Never cache Google API or sign-in traffic in the service worker; /api/auth/* are
        // page loads (sign-in redirects) that must reach the Netlify function.
        navigateFallbackDenylist: [/^\/__/, /^\/api\//],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
