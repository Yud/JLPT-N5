// Unit tests for the per-file logic the media-import Workflow
// (workflows/anki-import) runs per chunk — extracted into
// src/server/mediaImportProcessing.js specifically so it's testable here,
// directly, without needing a live Workflow runtime (mirrors how
// src/scheduling/scheduler.js is tested apart from its endpoint). The
// Workflow worker itself is exercised end-to-end by the media-process
// integration test and by the manual local/staging runs described in the
// PR — this file covers the D1/R2 logic those runs would otherwise be the
// only way to catch a regression in.
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { MissingUploadError, processMediaFile, tempMediaKey } from '../../src/server/mediaImportProcessing.js'

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM media_assets')
  await env.DB
    .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('222', 222, 'Media Deck', 1, Date.now(), Date.now())
    .run()
  await env.DB
    .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('imported-222-1', '222', 1, 'Front [sound:a.mp3]', 'Back <img src="b.jpg">', Date.now())
    .run()
})

describe('processMediaFile', () => {
  it('throws MissingUploadError when the temp upload is missing', async () => {
    await expect(
      processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'nope.mp3' })
    ).rejects.toBeInstanceOf(MissingUploadError)
  })

  it('moves the temp upload to its final key, upserts a MediaAsset row, rewrites referencing cards, and deletes the temp object', async () => {
    await env.MEDIA.put(tempMediaKey('222', 'a.mp3'), new Uint8Array([1, 2, 3]))
    await env.MEDIA.put(tempMediaKey('222', 'b.jpg'), new Uint8Array([4, 5]))

    await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3' })
    await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'b.jpg' })

    const { results: assets } = await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('222').all()
    expect(assets).toHaveLength(2)

    const audioAsset = assets.find((a) => a.filename === 'a.mp3')
    expect(audioAsset.content_type).toBe('audio/mpeg')
    expect(audioAsset.size_bytes).toBe(3)
    const storedObject = await env.MEDIA.get(audioAsset.id)
    expect(new Uint8Array(await storedObject.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(await env.MEDIA.get(tempMediaKey('222', 'a.mp3'))).toBeNull()

    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-222-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${audioAsset.id}]`)
    const imageAsset = assets.find((a) => a.filename === 'b.jpg')
    expect(card.back).toBe(`Back <img src="/api/media/${imageAsset.id}">`)
  })

  it('treats a missing temp upload as already-done, not an error, when a media_assets row already exists (safe step retry)', async () => {
    // A Workflow step retries its whole callback from the top on any
    // transient failure — a file that already finished earlier in the same
    // failed-and-retried attempt (including its temp-object cleanup) looks
    // exactly like this on the retry. It must not be treated as a missing
    // upload, or one flaky file aborts every other file's already-good
    // work in the same chunk.
    await env.MEDIA.put(tempMediaKey('222', 'a.mp3'), new Uint8Array([1, 2, 3]))
    const first = await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3' })
    expect(await env.MEDIA.get(tempMediaKey('222', 'a.mp3'))).toBeNull() // confirms the temp really is gone now

    const retry = await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3' })
    expect(retry).toEqual({ filename: 'a.mp3', mediaAssetId: first.mediaAssetId, alreadyProcessed: true })

    const storedObject = await env.MEDIA.get(first.mediaAssetId)
    expect(new Uint8Array(await storedObject.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('reuses the same media asset id when reprocessing the same unchanged content for a deck', async () => {
    await env.MEDIA.put(tempMediaKey('222', 'a.mp3'), new Uint8Array([1, 2, 3]))
    await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3' })
    const first = await env.DB.prepare('SELECT id FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    // Same byte length as before — same logical content, just re-run.
    await env.MEDIA.put(tempMediaKey('222', 'a.mp3'), new Uint8Array([9, 9, 9]))
    await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3' })
    const second = await env.DB.prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    expect(second.id).toBe(first.id)
  })

  it('assigns a new media asset id when the content actually changes, and cleans up the superseded object', async () => {
    // A same-URL content swap would otherwise be invisible to any client
    // that already cached GET /api/media/:id's "immutable" response — this
    // is exactly what this session's zstd-decompress fix ran into in
    // production (every file's byte length changed after the fix).
    await env.MEDIA.put(tempMediaKey('222', 'a.mp3'), new Uint8Array([1, 2, 3]))
    const first = await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3' })

    // In the real system, functions/api/decks/import.js runs before every
    // media-processing pass and resets a changed file's card text back to
    // the raw filename (it only reapplies a rewrite for media it's sure is
    // unchanged) — reproduce that here rather than leaving the previous
    // pass's URL in place, which processMediaFile's instr()-based lookup
    // would no longer find.
    await env.DB.prepare('UPDATE cards SET front = ? WHERE id = ?').bind('Front [sound:a.mp3]', 'imported-222-1').run()

    await env.MEDIA.put(tempMediaKey('222', 'a.mp3'), new Uint8Array([1, 2, 3, 4, 5]))
    const second = await processMediaFile({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3' })

    expect(second.mediaAssetId).not.toBe(first.mediaAssetId)
    const row = await env.DB.prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()
    expect(row).toEqual({ id: second.mediaAssetId, size_bytes: 5 })
    expect(await env.MEDIA.get(first.mediaAssetId)).toBeNull() // old object cleaned up, not orphaned
    expect(await env.MEDIA.get(second.mediaAssetId)).not.toBeNull()

    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-222-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${second.mediaAssetId}]`)
  })
})
