import { defineConfig } from 'vitest/config'

// Two projects with incompatible pools can't share one config: `app` runs
// component/unit tests under jsdom, `d1-integration` runs the Pages
// Functions under the real Workers runtime against a local D1 binding.
export default defineConfig({
  test: {
    projects: ['./vite.config.js', './functions/vitest.config.js'],
  },
})
