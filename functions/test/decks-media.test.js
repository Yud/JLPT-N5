import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function uploadMedia(deckId, files) {
  const formData = new FormData()
  for (const [filename, bytes] of Object.entries(files)) {
    formData.append(filename, new File([bytes], filename))
  }
  return exports.default.fetch(`https://example.com/api/decks/${deckId}/media`, {
    method: 'POST',
    headers: AUTH,
    body: formData,
  })
}

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

describe('POST /api/decks/:deckId/media', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/222/media', { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('404s for an unknown deck', async () => {
    const response = await uploadMedia('not-a-deck', { 'a.mp3': new Uint8Array([1]) })
    expect(response.status).toBe(404)
  })

  it('stores each file in R2, upserts a MediaAsset row, and rewrites referencing cards', async () => {
    const response = await uploadMedia('222', {
      'a.mp3': new Uint8Array([1, 2, 3]),
      'b.jpg': new Uint8Array([4, 5]),
    })
    expect(response.status).toBe(200)
    const { stored } = await response.json()
    expect(stored.sort()).toEqual(['a.mp3', 'b.jpg'])

    const { results: assets } = await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('222').all()
    expect(assets).toHaveLength(2)

    const audioAsset = assets.find((a) => a.filename === 'a.mp3')
    expect(audioAsset.content_type).toBe('audio/mpeg')
    expect(audioAsset.size_bytes).toBe(3)
    const stored_object = await env.MEDIA.get(audioAsset.id)
    expect(new Uint8Array(await stored_object.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-222-1').first()
    expect(card.front).toBe(`Front [sound:/api/media/${audioAsset.id}]`)
    const imageAsset = assets.find((a) => a.filename === 'b.jpg')
    expect(card.back).toBe(`Back <img src="/api/media/${imageAsset.id}">`)
  })

  it('reuses the same media asset id when re-uploading the same filename for a deck', async () => {
    await uploadMedia('222', { 'a.mp3': new Uint8Array([1]) })
    const first = await env.DB.prepare('SELECT id FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    await uploadMedia('222', { 'a.mp3': new Uint8Array([1, 2]) })
    const second = await env.DB.prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?').bind('222', 'a.mp3').first()

    expect(second.id).toBe(first.id)
    expect(second.size_bytes).toBe(2)
  })
})
