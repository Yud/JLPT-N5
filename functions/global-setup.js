import childProcess from 'node:child_process'
import events from 'node:events'
import path from 'node:path'

// Global setup runs inside Node.js, not workerd. Building to `dist-functions`
// rather than `dist` since Vitest ignores changes under `dist` by default.
export default async function () {
  // `wrangler pages functions build` resolves its `[directory]` and
  // `--outdir` arguments relative to cwd, so run from the repo root (one
  // level up) rather than from functions/ itself.
  const repoRoot = path.join(import.meta.dirname, '..')
  const buildProcess = childProcess.spawn(
    'wrangler pages functions build functions --outdir functions/dist-functions --watch',
    { cwd: repoRoot, shell: true }
  )
  buildProcess.stdout.pipe(process.stdout)
  buildProcess.stderr.pipe(process.stderr)

  // Wait for the first build to finish before tests start.
  await events.once(buildProcess.stdout, 'data')

  return () => {
    buildProcess.kill()
  }
}
