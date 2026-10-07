import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^zod$/,
        replacement: fileURLToPath(new URL('./src/lib/zod-browser.ts', import.meta.url)),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      {
        find: 'vuedraggable',
        replacement: fileURLToPath(
          new URL('./node_modules/vuedraggable/src/vuedraggable.js', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
})
