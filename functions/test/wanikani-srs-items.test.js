import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

// Deliberately just the guards that return before any WaniKani request —
// same reasoning as wanikani-words-sync.test.js: a real WANIKANI_API_KEY in
// the repo-root .env would otherwise make these hit the real WaniKani API.
describe('GET /api/wanikani/srs-items', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/wanikani/srs-items?stage=6')
    expect(response.status).toBe(401)
  })

  it.each(['', 'abc', '-1', '10', '2.5'])('rejects stage=%j', async (stage) => {
    const response = await exports.default.fetch(`https://example.com/api/wanikani/srs-items?stage=${stage}`, { headers: AUTH })
    expect(response.status).toBe(400)
  })

  it('rejects a missing stage', async () => {
    const response = await exports.default.fetch('https://example.com/api/wanikani/srs-items', { headers: AUTH })
    expect(response.status).toBe(400)
  })

  it('rejects a malformed after cursor', async () => {
    const response = await exports.default.fetch('https://example.com/api/wanikani/srs-items?stage=6&after=x', { headers: AUTH })
    expect(response.status).toBe(400)
  })
})
