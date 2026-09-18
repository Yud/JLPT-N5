import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function requestImport() {
  const response = await exports.default.fetch('https://example.com/api/decks/import', { method: 'POST', headers: AUTH })
  return response.json()
}

async function startImport(jobId) {
  return exports.default.fetch(`https://example.com/api/decks/import/${jobId}/start`, { method: 'POST', headers: AUTH })
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM deck_import_jobs')
  const { objects } = await env.MEDIA.list()
  await Promise.all(objects.map((object) => env.MEDIA.delete(object.key)))
})

describe('POST /api/decks/import/:jobId/start', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/import/some-job/start', { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('404s an unknown job', async () => {
    const response = await startImport('not-a-real-job')
    expect(response.status).toBe(404)
  })

  it('409s if the direct upload has not actually landed in R2 yet', async () => {
    const { jobId } = await requestImport()
    const response = await startImport(jobId)
    expect(response.status).toBe(409)

    const job = await env.DB.prepare('SELECT status FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
    expect(job.status).toBe('pending') // unchanged — never got as far as triggering anything
  })

  it('marks the job processing and triggers the Workflow once the upload exists', async () => {
    const { jobId } = await requestImport()
    const job = await env.DB.prepare('SELECT r2_key FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
    // Simulates "the browser's direct PUT to the presigned URL already
    // succeeded" — this test harness has no real r2.cloudflarestorage.com
    // endpoint to exercise the presigned URL itself against (see the
    // redesign plan's local-dev caveat), so the object is put directly via
    // the R2 binding instead, at the same key the job row already has.
    await env.MEDIA.put(job.r2_key, new Uint8Array([1, 2, 3]))

    const response = await startImport(jobId)
    expect(response.status).toBe(202)

    const updated = await env.DB.prepare('SELECT status FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
    expect(updated.status).toBe('processing')
  })
})
