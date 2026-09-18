// Unit tests for the per-file logic the DeckImportWorkflow (workflows/anki-import)
// runs per chunk — extracted into src/server/mediaImportProcessing.js
// specifically so it's testable here, directly, without needing a live
// Workflow runtime (mirrors how src/scheduling/scheduler.js is tested apart
// from its endpoint).
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { processMediaFromParsedDeck } from '../../src/server/mediaImportProcessing.js'

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM media_assets')
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
})

describe('processMediaFromParsedDeck', () => {
  it('no-ops (does not write anything) when bytes is null — a card referenced a filename missing from the archive', async () => {
    const result = await processMediaFromParsedDeck({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'nope.mp3', bytes: null })
    expect(result).toEqual({ filename: 'nope.mp3', skipped: true })
    expect(await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('222').first()).toBeNull()
  })

  it('writes the asset to its permanent key, upserts a media_assets row, and rewrites referencing cards', async () => {
    await processMediaFromParsedDeck({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3]) })
    await processMediaFromParsedDeck({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'b.jpg', bytes: new Uint8Array([4, 5]) })

    const { results: assets } = await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('222').all()
    expect(assets).toHaveLength(2)

    const audioAsset = assets.find((a) => a.filename === 'a.mp3')
    expect(audioAsset.content_type).toBe('audio/mpeg')
    expect(audioAsset.size_bytes).toBe(3)
    const storedObject = await env.MEDIA.get(audioAsset.id)
    expect(new Uint8Array(await storedObject.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-222-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${audioAsset.id}]`)
    const imageAsset = assets.find((a) => a.filename === 'b.jpg')
    expect(card.back).toBe(`Back <img src="/api/media/${imageAsset.id}">`)
  })

  it('reuses the same media asset id when reprocessing the same unchanged content for a deck', async () => {
    await processMediaFromParsedDeck({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3]) })
    const first = await env.DB.prepare('SELECT id FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    // Same byte length as before — same logical content, just re-run (e.g. a
    // Workflow step retry re-decompressing the same file).
    await processMediaFromParsedDeck({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3', bytes: new Uint8Array([9, 9, 9]) })
    const second = await env.DB.prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    expect(second.id).toBe(first.id)
  })

  it('assigns a new media asset id when the content actually changes, and cleans up the superseded object', async () => {
    // A same-URL content swap would otherwise be invisible to any client
    // that already cached GET /api/media/:id's "immutable" response.
    const first = await processMediaFromParsedDeck({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3]) })

    // In the real system, the deck's cards are re-upserted with raw filename
    // references before media processing re-runs (upsertDeckAndCards always
    // writes the freshly-parsed HTML) — reproduce that here rather than
    // leaving the previous pass's URL in place, which the instr()-based
    // lookup below would no longer find.
    await env.DB.prepare('UPDATE cards SET front = ? WHERE id = ?').bind('Front [sound:a.mp3]', 'imported-222-1').run()

    const second = await processMediaFromParsedDeck({ db: env.DB, mediaBucket: env.MEDIA, deckId: '222', filename: 'a.mp3', bytes: new Uint8Array([1, 2, 3, 4, 5]) })

    expect(second.mediaAssetId).not.toBe(first.mediaAssetId)
    const row = await env.DB.prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()
    expect(row).toEqual({ id: second.mediaAssetId, size_bytes: 5 })
    expect(await env.MEDIA.get(first.mediaAssetId)).toBeNull() // old object cleaned up, not orphaned
    expect(await env.MEDIA.get(second.mediaAssetId)).not.toBeNull()

    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-222-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${second.mediaAssetId}]`)
  })
})
