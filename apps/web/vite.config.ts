import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const localTools =
    mode === 'development' && loadEnv(mode, process.cwd()).VITE_ENABLE_LOCAL_ADMIN_TOOLS === 'true'
  return {
    server: {
      host: localTools ? '127.0.0.1' : true,
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          // Optionnel : rewrite des chemins si besoin
          // rewrite: (path) => path.replace(/^\/api/, '')
        },
      },
    },
    plugins: [
      vue(),
      vueDevTools(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/health(?:\/|$)/],
          runtimeCaching: [],
        },
        includeAssets: ['favicon.svg', 'robots.txt'],
        manifest: {
          name: 'Kado',
          short_name: 'kado',
          description: 'Gestion de piges de cadeaux',
          theme_color: '#4F46E5',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    css: {
      preprocessorOptions: {
        scss: {
          quietDeps: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // The UMD build probes eval and embeds a second Vue runtime; compile its ESM source for CSP.
        vuedraggable: fileURLToPath(
          new URL('./node_modules/vuedraggable/src/vuedraggable.js', import.meta.url),
        ),
      },
    },
  }
})
