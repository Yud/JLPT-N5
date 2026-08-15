import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defaultExclude } from 'vitest/config'

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  test: {
    name: 'app',
    environment: 'jsdom',
    globals: true,
    // tests/e2e is a Playwright suite (its own test() import), not Vitest's.
    // functions/ has its own project (functions/vitest.config.js) running
    // under the Workers pool against a real local D1 — it can't run here.
    exclude: [...defaultExclude, 'tests/e2e/**', 'functions/**'],
  },
})
