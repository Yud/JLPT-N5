import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, '..', 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  return {
    test: {
      name: 'd1-integration',
      setupFiles: ['./test/apply-migrations.js'],
      globalSetup: ['./global-setup.js'],
    },
    plugins: [
      cloudflareTest({
        // Built from functions/ by global-setup.js (file-based routing ->
        // a single Worker script), same as the real Pages deploy.
        main: './dist-functions/index.js',
        wrangler: { configPath: '../wrangler.toml' },
        miniflare: {
          // Test-only binding so the setup file can apply migrations.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
  }
})
