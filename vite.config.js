import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defaultExclude } from 'vitest/config'

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    // tests/e2e is a Playwright suite (its own test() import), not Vitest's.
    exclude: [...defaultExclude, 'tests/e2e/**'],
  },
})
