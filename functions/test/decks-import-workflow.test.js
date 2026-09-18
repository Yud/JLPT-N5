// End-to-end test of the DeckImportWorkflow (workflows/anki-import): uploads
// a small real .apkg fixture straight to R2 (mirroring the direct-upload
// design — no Pages Function ever sees the file bytes), triggers the
// Workflow the same way functions/api/decks/import/[jobId]/start.js does,
// and waits for the job to actually finish. Uses a minimal legacy-format
// fixture (plain SQLite, plain JSON media manifest, uncompressed media) —
// zstd/protobuf format-variant correctness is already covered by
// src/data/ankiImport.test.js; this test's job is verifying the Workflow's
// own wiring (steps, job-row progress tracking, R2 writes, card rewriting).
import { env, exports } from 'cloudflare:workers'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSqlJsForWorkflow } from '../../workflows/anki-import/src/loadSqlJs.js'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function buildSampleApkg() {
  // Reuses the exact loader the real Workflow uses — this test exercises
  // that loader for real, not a duplicate.
  const SQL = await loadSqlJsForWorkflow()
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER);
    CREATE TABLE fields (ntid INTEGER, ord INTEGER, name TEXT);
    CREATE TABLE templates (ntid INTEGER, ord INTEGER, config BLOB);
  `)
  db.run('INSERT INTO decks (id, name) VALUES (?, ?)', [900, 'Workflow Test Deck'])
  db.run('INSERT INTO fields (ntid, ord, name) VALUES (1, 0, ?), (1, 1, ?)', ['Front', 'Back'])
  // Template config is a protobuf blob (field 1 = qfmt, field 2 = afmt) —
  // build it with the same minimal writer ankiImport.test.js uses.
  const utf8 = new TextEncoder()
  function writeVarint(value) {
    const bytes = []
    let v = value >>> 0
    do {
      let byte = v & 0x7f
      v >>>= 7
      if (v !== 0) byte |= 0x80
      bytes.push(byte)
    } while (v !== 0)
    return Uint8Array.from(bytes)
  }
  function field(fieldNumber, contentBytes) {
    return Uint8Array.from([...writeVarint((fieldNumber << 3) | 2), ...writeVarint(contentBytes.length), ...contentBytes])
  }
  const qfmt = utf8.encode('{{Front}}')
  const afmt = utf8.encode('{{FrontSide}}<hr>{{Back}} [sound:audio.mp3]')
  const config = new Uint8Array([...field(1, qfmt), ...field(2, afmt)])
  db.run('INSERT INTO templates (ntid, ord, config) VALUES (1, 0, ?)', [config])
  db.run('INSERT INTO notes (id, mid, flds) VALUES (100, 1, ?)', [['私', 'I'].join('\x1f')])
  db.run('INSERT INTO cards (id, nid, did, ord) VALUES (1000, 100, 900, 0)')
  const collectionBytes = db.export()
  db.close()

  const zip = new JSZip()
  zip.file('collection.anki2', collectionBytes)
  zip.file('media', utf8.encode(JSON.stringify({ 0: 'audio.mp3' })))
  zip.file('0', new Uint8Array([1, 2, 3, 4, 5])) // "audio.mp3", uncompressed — legacy format needs no zstd
  return zip.generateAsync({ type: 'uint8array' })
}

async function requestImport() {
  const response = await exports.default.fetch('https://example.com/api/decks/import', { method: 'POST', headers: AUTH })
  return response.json()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollJobUntilTerminal(jobId, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const job = await env.DB.prepare('SELECT * FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
    if (job.status === 'done' || job.status === 'error') return job
    if (Date.now() > deadline) throw new Error(`Job ${jobId} did not reach a terminal status within ${timeoutMs}ms (stuck at '${job.status}')`)
    await sleep(50)
  }
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM deck_import_jobs')
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM media_assets')
  const { objects } = await env.MEDIA.list()
  await Promise.all(objects.map((object) => env.MEDIA.delete(object.key)))
})

describe('DeckImportWorkflow (end to end)', () => {
  it('parses, upserts, processes media, and rewrites card references, reaching status done', async () => {
    const apkgBytes = await buildSampleApkg()

    const { jobId, uploadUrl } = await requestImport()
    expect(uploadUrl).toEqual(expect.any(String)) // presigned URL was generated (not exercised — no real R2 S3-API endpoint here, see decks-import-start.test.js)

    const job = await env.DB.prepare('SELECT r2_key FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
    await env.MEDIA.put(job.r2_key, apkgBytes) // simulates the direct browser->R2 PUT having succeeded

    const startResponse = await exports.default.fetch(`https://example.com/api/decks/import/${jobId}/start`, {
      method: 'POST',
      headers: AUTH,
    })
    expect(startResponse.status).toBe(202)

    const finalJob = await pollJobUntilTerminal(jobId)
    expect(finalJob).toMatchObject({ status: 'done', decks_total: 1, decks_done: 1, media_total: 1, media_done: 1 })

    const deckRow = await env.DB.prepare('SELECT * FROM decks WHERE anki_deck_id = ?').bind(900).first()
    expect(deckRow).toMatchObject({ name: 'Workflow Test Deck', card_count: 1 })

    const cardRow = await env.DB.prepare('SELECT * FROM cards WHERE deck_id = ?').bind(deckRow.id).first()
    expect(cardRow.front).toBe('私')

    const mediaRow = await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind(deckRow.id).first()
    expect(mediaRow).toMatchObject({ filename: 'audio.mp3', content_type: 'audio/mpeg', size_bytes: 5 })
    expect(cardRow.back).toBe(`私<hr>I [sound:/api/media/${mediaRow.id}]`)

    const storedMedia = await env.MEDIA.get(mediaRow.id)
    expect(new Uint8Array(await storedMedia.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]))

    // The raw upload is cleaned up once the job finishes successfully.
    expect(await env.MEDIA.get(job.r2_key)).toBeNull()
  })
})
