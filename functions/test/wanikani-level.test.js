import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

// Deliberately just the guards that return before any WaniKani request —
// same reasoning as wanikani-words-sync.test.js: a real WANIKANI_API_KEY in
// the repo-root .env would otherwise make these hit the real WaniKani API.
describe('GET /api/wanikani/level', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/wanikani/level?level=1')
    expect(response.status).toBe(401)
  })

  it('rejects a non-integer level', async () => {
    const response = await exports.default.fetch('https://example.com/api/wanikani/level?level=abc', {
      headers: { 'Cf-Access-Authenticated-User-Email': 'test@example.com' },
    })
    expect(response.status).toBe(400)
  })
})
