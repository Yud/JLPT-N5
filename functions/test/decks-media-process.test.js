// Covers the D1 row lifecycle for POST .../media/process and
// GET .../media/jobs/:jobId — the actual per-file media processing these
// trigger runs inside the Workflow worker (workflows/anki-import), unit
// tested separately in media-import-processing.test.js. This file's "wait
// for it to finish" assertions exercise the real service binding + Workflow
// running locally (see functions/vitest.config.js's auxiliary worker), same
// as production, just without a real deploy.
import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { tempMediaKey } from '../../src/server/mediaImportProcessing.js'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function processMedia(deckId, filenames) {
  return exports.default.fetch(`https://example.com/api/decks/${deckId}/media/process`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filenames }),
  })
}

async function getJob(deckId, jobId) {
  return exports.default.fetch(`https://example.com/api/decks/${deckId}/media/jobs/${jobId}`, { headers: AUTH })
}

async function waitForJob(deckId, jobId, { timeoutMs = 10_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const response = await getJob(deckId, jobId)
    const job = await response.json()
    if (job.status === 'done' || job.status === 'error') return job
    if (Date.now() > deadline) throw new Error(`Timed out waiting for job ${jobId}, last status: ${job.status}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM media_assets')
  await env.DB.exec('DELETE FROM media_import_jobs')
  await env.DB
    .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('444', 444, 'Process Deck', 1, Date.now(), Date.now())
    .run()
  await env.DB
    .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('imported-444-1', '444', 1, 'Front [sound:a.mp3]', 'Back', Date.now())
    .run()
})

describe('POST /api/decks/:deckId/media/process', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/444/media/process', { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('404s for an unknown deck', async () => {
    const response = await processMedia('not-a-deck', ['a.mp3'])
    expect(response.status).toBe(404)
  })

  it('returns a null jobId and creates no job row when there is nothing to process', async () => {
    const response = await processMedia('444', [])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ jobId: null })

    const { results: jobs } = await env.DB.prepare('SELECT * FROM media_import_jobs').all()
    expect(jobs).toHaveLength(0)
  })

  it('creates a pending job row and returns its id', async () => {
    const response = await processMedia('444', ['a.mp3'])
    expect(response.status).toBe(200)
    const { jobId } = await response.json()
    expect(jobId).toBeTruthy()

    const job = await env.DB.prepare('SELECT * FROM media_import_jobs WHERE id = ?').bind(jobId).first()
    expect(job).toMatchObject({ deck_id: '444', total: 1, done: 0 })
    expect(['pending', 'processing']).toContain(job.status)
  })

  it('drives the Workflow to completion: card gets rewritten and the job reaches done', async () => {
    await env.MEDIA.put(tempMediaKey('444', 'a.mp3'), new Uint8Array([1, 2, 3]))

    const { jobId } = await (await processMedia('444', ['a.mp3'])).json()
    const job = await waitForJob('444', jobId)

    expect(job).toMatchObject({ id: jobId, deckId: '444', status: 'done', total: 1, done: 1, error: null })

    const asset = await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ? AND filename = ?').bind('444', 'a.mp3').first()
    expect(asset).toBeTruthy()
    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-444-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${asset.id}]`)
  })

  it('marks the job as error (without crashing) when an uploaded file is missing', async () => {
    // Deliberately not uploading a.mp3 first — the Workflow's per-file step
    // should hit MissingUploadError and the job should surface it, not hang
    // at 'processing' forever.
    const { jobId } = await (await processMedia('444', ['a.mp3'])).json()
    const job = await waitForJob('444', jobId)

    expect(job.status).toBe('error')
    expect(job.error).toMatch(/a\.mp3/)
  })
})

describe('GET /api/decks/:deckId/media/jobs/:jobId', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/444/media/jobs/some-id')
    expect(response.status).toBe(401)
  })

  it('404s for an unknown job', async () => {
    const response = await getJob('444', 'not-a-job')
    expect(response.status).toBe(404)
  })
})
