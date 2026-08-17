import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { defaultExclude } from 'vitest/config'

export default defineConfig({
  base: './',
  // ui() bundles its own @tailwindcss/vite plugin, so it replaces (not
  // supplements) a standalone tailwindcss() plugin. colorMode: false skips
  // Nuxt UI's own dark-mode state management — useTheme.js already owns
  // that (see style.css for how the two are wired together).
  plugins: [vue(), ui({ colorMode: false })],
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
