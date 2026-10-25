import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

/** Ícones gerados por `npm run pwa:icons` (pwa-assets.config.ts) a partir de public/icon.svg. */
const ICON_192 = [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Nova versão fica "waiting" até o usuário aceitar no toast (UpdateToast.tsx)
      registerType: 'prompt',
      // Registro feito uma única vez via useRegisterSW (virtual:pwa-register/react)
      injectRegister: false,
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'Correção Financeira',
        short_name: 'Correção Fin.',
        description:
          'Calculadora e plataforma de análise financeira — correção monetária, tesouraria, câmbio, WACC e aposentadoria.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/#/app/calculadora',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        background_color: '#0b1326',
        theme_color: '#0b1326',
        categories: ['finance', 'business', 'productivity'],
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Calculadora', short_name: 'Calc.', url: '/#/app/calculadora', icons: ICON_192 },
          { name: 'Comparador', short_name: 'Comparar', url: '/#/app/comparador', icons: ICON_192 },
          { name: 'Câmbio', short_name: 'Câmbio', url: '/#/app/cambio', icons: ICON_192 },
          { name: 'Tesouraria', short_name: 'Tesour.', url: '/#/app/tesouraria', icons: ICON_192 },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        // chunks de xlsx / jspdf / recharts passam do limite padrão de 2 MiB
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // O hash (#/app/...) nunca chega ao SW: toda navegação cai no shell
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        inlineWorkboxRuntime: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // GETs da API (mesma origem no dev, Render em produção — a URL só é conhecida no build).
            // NetworkFirst: online sempre busca dado novo; offline devolve o último em cache.
            // POSTs (cálculos) nunca são cacheados.
            urlPattern: ({ url, request }) => request.method === 'GET' && /\/api\//.test(url.pathname),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'api-get',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 15 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        // Desligado por padrão (SW em dev atrapalha o HMR). Ligar com VITE_PWA_DEV=1.
        enabled: process.env.VITE_PWA_DEV === '1',
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    // `vite preview` (build de produção com service worker) — mesma API do dev
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
