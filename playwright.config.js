import { defineConfig, devices } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Reuses the Chromium build the brew-installed `playwright-cli` already
// manages in ~/Library/Caches/ms-playwright instead of letting
// @playwright/test download its own pinned revision — avoids a second
// multi-hundred-MB browser binary on disk. Picks whichever chromium-<rev>
// build is present, so it keeps working as brew updates playwright-cli.
function cachedChromiumPath() {
  const cacheDir = join(homedir(), 'Library/Caches/ms-playwright')
  if (!existsSync(cacheDir)) return undefined
  const dir = readdirSync(cacheDir)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort()
    .pop()
  if (!dir) return undefined
  const exe = join(cacheDir, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium')
  return existsSync(exe) ? exe : undefined
}

const executablePath = cachedChromiumPath()

// This suite is local-only by design (see README.md's "E2E tests" section):
// it depends on a Chromium build managed outside npm (via brew's
// playwright-cli), which CI doesn't have. `npm test` (what CI's deploy.yml
// runs) never calls this — only `npm run test:e2e` does. This check is a
// second guard so the suite fails loudly instead of silently misbehaving if
// it's ever invoked in CI by mistake.
if (process.env.CI) {
  throw new Error('tests/e2e is local-only and must not run in CI — see README.md "E2E tests"')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
