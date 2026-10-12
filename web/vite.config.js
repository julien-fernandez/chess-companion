import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import viteDevLogs from 'vite-dev-logs'

export default defineConfig({
  server: {
    forwardConsole: true,
    proxy: { '/api': 'http://127.0.0.1:8110' },
  },
  plugins: [
    react(),
    viteDevLogs({
      url: '/dev-logger',
      outputFolder: '../logs',
      outputFileName: 'chess_web',
    }),
    VitePWA({
      registerType: 'autoUpdate',
      // Le site est derrière une authentification basique : sans identifiants, le manifeste rend 401.
      useCredentials: true,
      includeAssets: ['icons/*.png', 'stockfish.js'],
      manifest: {
        name: 'Chess Companion',
        short_name: 'Chess',
        description: 'Compagnon IA pour jouer aux échecs OTB',
        theme_color: '#1c1c1c',
        background_color: '#1c1c1c',
        display: 'standalone',
        start_url: '/#revision',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
