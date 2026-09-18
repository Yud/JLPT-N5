import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { unstable_getMiniflareWorkerOptions } from 'wrangler'

const execFileAsync = promisify(execFile)

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, '..', 'migrations')
  const migrations = await readD1Migrations(migrationsPath)

  // functions/api/decks/import/[jobId]/start.js reaches the DeckImportWorkflow
  // (workflows/anki-import) through a service binding
  // (DECK_IMPORT_WORKFLOW_TRIGGER, root wrangler.toml) — Pages Functions
  // can't define a WorkflowEntrypoint directly. Registering that Worker as
  // an auxiliary worker here, built from its own real wrangler.toml, is
  // what lets the binding actually resolve inside this test run instead of
  // erroring; it's the same worker real `wrangler dev` would find via its
  // local service-binding registry.
  const repoRoot = path.join(import.meta.dirname, '..')
  const workflowDir = path.join(repoRoot, 'workflows', 'anki-import')
  const workflowWorkerConfigPath = path.join(workflowDir, 'wrangler.toml')
  const { workerOptions: rawWorkflowWorkerOptions } = unstable_getMiniflareWorkerOptions(workflowWorkerConfigPath)
  // modulesRules/modules/rootPath aren't reused below — this worker's real
  // source (src/index.js) imports actual npm packages (fflate, fzstd, sql.js)
  // and a static .wasm file, which only Wrangler's own bundler (esbuild)
  // resolves correctly; Miniflare's raw modules-list mode has no equivalent
  // for bare-specifier package resolution, so pointing it at the unbundled
  // source (as this worker's D1/R2/Workflow *bindings* still come from
  // below) fails with "No such module 'fflate'" the moment ankiImport.js
  // is imported. `wrangler deploy --dry-run --outdir` runs the real build
  // pipeline instead — same as global-setup.js already does for the main
  // Pages Functions bundle (functions/dist-functions) — producing a single
  // self-contained script plus the wasm file as a content-hashed sibling
  // asset, which *is* something Miniflare's modules list can load directly.
  const { modulesRules: _workflowModulesRules, modules: _workflowModules, rootPath: _workflowRootPath, ...workflowWorkerBindings } =
    rawWorkflowWorkerOptions

  const workflowBuildDir = path.join(import.meta.dirname, 'dist-workflow')
  await execFileAsync(path.join(repoRoot, 'node_modules', '.bin', 'wrangler'), ['deploy', '--dry-run', '--outdir', workflowBuildDir], {
    cwd: workflowDir,
  })
  const builtFiles = await fs.readdir(workflowBuildDir)
  const wasmFile = builtFiles.find((name) => name.endsWith('.wasm'))
  if (!wasmFile) throw new Error(`workflows/anki-import build produced no .wasm file in ${workflowBuildDir} — check the build output`)

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
          bindings: {
            // Test-only binding so the setup file can apply migrations.
            TEST_MIGRATIONS: migrations,
            // Dummy R2 API credentials — functions/api/decks/import.js signs
            // a presigned upload URL with these; the signature itself is
            // never actually verified by anything in this test run (no real
            // R2 S3-API endpoint is involved), so any fixed string works.
            R2_ACCESS_KEY_ID: 'test-access-key-id',
            R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
            CF_ACCOUNT_ID: 'test-account-id',
          },
          workers: [
            {
              ...workflowWorkerBindings,
              name: 'workflows-anki-import',
              modules: [
                { type: 'ESModule', path: path.join(workflowBuildDir, 'index.js') },
                { type: 'CompiledWasm', path: path.join(workflowBuildDir, wasmFile) },
              ],
              // The bundled index.js's wasm import is rewritten to a plain
              // relative specifier ("./<hash>-sql-wasm.wasm") pointing at its
              // sibling in the same build output directory — modulesRoot
              // must match so that resolves correctly.
              modulesRoot: workflowBuildDir,
            },
          ],
        },
      }),
    ],
  }
})
