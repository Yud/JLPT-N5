import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { unstable_getMiniflareWorkerOptions } from 'wrangler'

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, '..', 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  // functions/api/decks/[deckId]/media/process.js reaches the media-import
  // Workflow (workflows/anki-import) through a service binding
  // (MEDIA_IMPORT_WORKFLOW_TRIGGER, root wrangler.toml) — Pages Functions
  // can't define a WorkflowEntrypoint directly. Registering that Worker as
  // an auxiliary worker here, built from its own real wrangler.toml, is
  // what lets the binding actually resolve inside this test run instead of
  // erroring; it's the same worker real `wrangler dev` would find via its
  // local service-binding registry.
  const workflowWorkerConfigPath = path.join(import.meta.dirname, '..', 'workflows', 'anki-import', 'wrangler.toml')
  const { workerOptions: rawWorkflowWorkerOptions, main: workflowWorkerMain } = unstable_getMiniflareWorkerOptions(workflowWorkerConfigPath)
  // modulesRules isn't representable in the pool's (Miniflare v5-shaped)
  // worker options — this worker doesn't need any, so just drop it rather
  // than fail to start.
  const { modulesRules: _workflowModulesRules, ...workflowWorkerOptions } = rawWorkflowWorkerOptions
  const repoRoot = path.join(import.meta.dirname, '..')

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
          workers: [
            {
              ...workflowWorkerOptions,
              name: 'workflows-anki-import',
              rootPath: path.join(repoRoot, 'workflows', 'anki-import'),
              // `modules: true` (Miniflare's convenience single-file mode)
              // only registers the entry script itself — it doesn't crawl
              // its imports, and this worker's src/index.js imports the
              // shared per-file processing logic from
              // ../../../src/server/mediaImportProcessing.js (so it can be
              // reused verbatim from the Pages Functions side too). Its own
              // module-fallback service only serves files already in
              // Vite's graph, which this auxiliary worker's raw scriptPath
              // bypasses — so both modules are listed explicitly instead.
              modules: [
                { type: 'ESModule', path: workflowWorkerMain },
                { type: 'ESModule', path: path.join(repoRoot, 'src', 'server', 'mediaImportProcessing.js') },
              ],
              // Repo root, so the relative import above resolves to the
              // same module name ("src/server/mediaImportProcessing.js")
              // as the specifier it's imported by.
              modulesRoot: repoRoot,
            },
          ],
        },
      }),
    ],
  }
})
