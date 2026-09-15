import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

// Deliberately just the auth guard. Wrangler auto-loads the repo-root .env
// into this test environment the same way it does for `wrangler pages dev`
// (see README's WaniKani listening quiz section) — so if a real
// WANIKANI_API_KEY happens to be set there (e.g. for scripts/sync-wanikani-words.mjs),
// a test that asserts on the "key missing" path would instead exercise the
// real WaniKani API. Nothing here should ever make a real outbound request.
describe('POST /api/wanikani-words/sync', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/wanikani-words/sync', { method: 'POST' })
    expect(response.status).toBe(401)
  })
})
