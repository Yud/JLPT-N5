import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function requestImport() {
  return exports.default.fetch('https://example.com/api/decks/import', { method: 'POST', headers: AUTH })
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM deck_import_jobs')
})

describe('POST /api/decks/import', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/import', { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('creates a pending job and returns a presigned upload URL', async () => {
    const response = await requestImport()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.jobId).toEqual(expect.any(String))
    expect(body.uploadUrl).toContain(`raw-imports/${body.jobId}.apkg`)
    expect(body.uploadUrl).toContain('X-Amz-Signature=') // actually signed, not just a bare URL

    const job = await env.DB.prepare('SELECT * FROM deck_import_jobs WHERE id = ?').bind(body.jobId).first()
    expect(job).toMatchObject({ status: 'pending', r2_key: `raw-imports/${body.jobId}.apkg` })
  })

  it('never sees file bytes — the request body is empty', async () => {
    // Regression guard for the whole point of this design: uploading is a
    // direct browser-to-R2 PUT (functions/api/decks/import/[jobId]/start.js
    // confirms it landed), never a file proxied through this endpoint.
    const response = await requestImport()
    const body = await response.json()
    const { objects } = await env.MEDIA.list({ prefix: `raw-imports/${body.jobId}` })
    expect(objects).toHaveLength(0)
  })
})
