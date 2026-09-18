// Unit tests for the per-chunk logic the DeckImportWorkflow (workflows/anki-import)
// runs per media chunk step — extracted into src/server/mediaImportProcessing.js
// specifically so it's testable here, directly, without needing a live
// Workflow runtime (mirrors how src/scheduling/scheduler.js is tested apart
// from its endpoint).
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { processMediaChunk } from '../../src/server/mediaImportProcessing.js'

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM media_assets')
  await env.DB.exec('DELETE FROM card_media_refs')
  const { objects } = await env.MEDIA.list()
  await Promise.all(objects.map((object) => env.MEDIA.delete(object.key)))

  await env.DB
    .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('222', 222, 'Media Deck', 1, Date.now(), Date.now())
    .run()
  await env.DB
    .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('imported-222-1', '222', 1, 'Front [sound:a.mp3]', 'Back <img src="b.jpg">', Date.now())
    .run()
  // processMediaChunk now finds referencing cards via this indexed reverse
  // lookup (see migrations/0009_create_card_media_refs.sql), not by scanning
  // every card's text — in the real pipeline, upsertCardChunk populates this
  // at the same time it writes the card above.
  await env.DB
    .prepare('INSERT INTO card_media_refs (deck_id, filename, card_id) VALUES (?, ?, ?), (?, ?, ?)')
    .bind('222', 'a.mp3', 'imported-222-1', '222', 'b.jpg', 'imported-222-1')
    .run()
})

describe('processMediaChunk', () => {
  it('no-ops (does not write anything) for a file whose bytes is null — a card referenced a filename missing from the archive', async () => {
    const results = await processMediaChunk({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', files: [{ filename: 'nope.mp3', bytes: null }] })
    expect(results).toEqual([{ filename: 'nope.mp3', skipped: true }])
    expect(await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('222').first()).toBeNull()
  })

  it('writes each asset to its permanent key, upserts a media_assets row, and rewrites referencing cards, in one chunk', async () => {
    await processMediaChunk({
      db: env.DB,
      mediaBucket: env.MEDIA,
      deckId: '222',
      files: [
        { filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3]) },
        { filename: 'b.jpg', bytes: new Uint8Array([4, 5]) },
      ],
    })

    const { results: assets } = await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('222').all()
    expect(assets).toHaveLength(2)

    const audioAsset = assets.find((a) => a.filename === 'a.mp3')
    expect(audioAsset.content_type).toBe('audio/mpeg')
    expect(audioAsset.size_bytes).toBe(3)
    const storedObject = await env.MEDIA.get(audioAsset.id)
    expect(new Uint8Array(await storedObject.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    // Both files reference the SAME card — proves the chunk's writes are
    // correctly layered (one file's rewrite doesn't clobber the other's),
    // the reason processMediaChunk batches via db.batch() instead of one
    // independent UPDATE per file.
    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-222-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${audioAsset.id}]`)
    const imageAsset = assets.find((a) => a.filename === 'b.jpg')
    expect(card.back).toBe(`Back <img src="/api/media/${imageAsset.id}">`)
  })

  it('reuses the same media asset id when reprocessing the same unchanged content for a deck', async () => {
    await processMediaChunk({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', files: [{ filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3]) }] })
    const first = await env.DB.prepare('SELECT id FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    // Same byte length as before — same logical content, just re-run (e.g. a
    // Workflow step retry re-decompressing the same file).
    await processMediaChunk({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', files: [{ filename: 'a.mp3', bytes: new Uint8Array([9, 9, 9]) }] })
    const second = await env.DB.prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    expect(second.id).toBe(first.id)
  })

  it('assigns a new media asset id when the content actually changes, and cleans up the superseded object', async () => {
    // A same-URL content swap would otherwise be invisible to any client
    // that already cached GET /api/media/:id's "immutable" response.
    const [first] = await processMediaChunk({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', files: [{ filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3]) }] })

    // In the real system, the deck's cards are re-upserted with raw filename
    // references before media processing re-runs (upsertCardChunk always
    // writes the freshly-rendered HTML) — reproduce that here rather than
    // leaving the previous pass's URL in place. card_media_refs (seeded in
    // beforeEach) is untouched — it's populated by upsertCardChunk, not by
    // processMediaChunk, so it stays valid across this re-run.
    await env.DB.prepare('UPDATE cards SET front = ? WHERE id = ?').bind('Front [sound:a.mp3]', 'imported-222-1').run()

    const [second] = await processMediaChunk({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', files: [{ filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3, 4, 5]) }] })

    expect(second.mediaAssetId).not.toBe(first.mediaAssetId)
    const row = await env.DB.prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()
    expect(row).toEqual({ id: second.mediaAssetId, size_bytes: 5 })
    expect(await env.MEDIA.get(first.mediaAssetId)).toBeNull() // old object cleaned up, not orphaned
    expect(await env.MEDIA.get(second.mediaAssetId)).not.toBeNull()

    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-222-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${second.mediaAssetId}]`)
  })

  it('handles a chunk larger than D1\'s 100-bound-parameters-per-query limit without erroring', async () => {
    // Regression test: the existence-check SELECT binds one `?` per filename
    // plus one for deckId — a single query for a 150-file chunk would bind
    // 151 params and fail with "D1_ERROR: too many SQL variables" (hit in
    // production at a real chunk size of 100). 150 here is arbitrary, just
    // comfortably past both the 100-param limit and MAX_FILENAMES_PER_EXISTENCE_QUERY.
    const files = Array.from({ length: 150 }, (_, i) => ({ filename: `f${i}.mp3`, bytes: new Uint8Array([i % 256]) }))

    const results = await processMediaChunk({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', files })

    expect(results).toHaveLength(150)
    expect(results.every((r) => typeof r.mediaAssetId === 'string')).toBe(true)
    const { results: assets } = await env.DB.prepare('SELECT filename FROM media_assets WHERE deck_id = ?').bind('222').all()
    expect(assets).toHaveLength(150)
  })

  it('rewrites every card that shares a media file, not just one', async () => {
    // A shared audio clip referenced by two different notes — the old
    // instr()-based UPDATE matched (and rewrote) every referencing row in
    // one statement; the indexed-lookup replacement issues one UPDATE per
    // referencing card_id, so this specifically covers that fan-out.
    await env.DB
      .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('imported-222-2', '222', 2, 'Question two [sound:shared.mp3]', 'Answer two', Date.now())
      .run()
    await env.DB
      .prepare('INSERT INTO card_media_refs (deck_id, filename, card_id) VALUES (?, ?, ?)')
      .bind('222', 'shared.mp3', 'imported-222-2')
      .run()

    const [{ mediaAssetId }] = await processMediaChunk({
      db: env.DB,
      mediaBucket: env.MEDIA,
      deckId: '222',
      files: [{ filename: 'shared.mp3', bytes: new Uint8Array([7, 7]) }],
    })

    const card2 = await env.DB.prepare('SELECT front FROM cards WHERE id = ?').bind('imported-222-2').first()
    expect(card2.front).toBe(`Question two [sound:/api/media/${mediaAssetId}]`)
  })
})
