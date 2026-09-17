import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { tempMediaKey } from '../../src/server/mediaImportProcessing.js'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function uploadMedia(deckId, files) {
  const formData = new FormData()
  for (const [filename, bytes] of Object.entries(files)) {
    formData.append(filename, new File([bytes], filename))
  }
  return exports.default.fetch(`https://example.com/api/decks/${deckId}/media/upload`, {
    method: 'POST',
    headers: AUTH,
    body: formData,
  })
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB
    .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('222', 222, 'Media Deck', 1, Date.now(), Date.now())
    .run()
})

describe('POST /api/decks/:deckId/media/upload', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/222/media/upload', { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('404s for an unknown deck', async () => {
    const response = await uploadMedia('not-a-deck', { 'a.mp3': new Uint8Array([1]) })
    expect(response.status).toBe(404)
  })

  it('stores each file at its temp R2 key and touches no D1 tables', async () => {
    const response = await uploadMedia('222', {
      'a.mp3': new Uint8Array([1, 2, 3]),
      'b.jpg': new Uint8Array([4, 5]),
    })
    expect(response.status).toBe(200)
    const { stored } = await response.json()
    expect(stored.sort()).toEqual(['a.mp3', 'b.jpg'])

    const a = await env.MEDIA.get(tempMediaKey('222', 'a.mp3'))
    expect(new Uint8Array(await a.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    const b = await env.MEDIA.get(tempMediaKey('222', 'b.jpg'))
    expect(new Uint8Array(await b.arrayBuffer())).toEqual(new Uint8Array([4, 5]))

    const { results: assets } = await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('222').all()
    expect(assets).toHaveLength(0)
  })

  it('overwrites the temp object when the same filename is uploaded again', async () => {
    await uploadMedia('222', { 'a.mp3': new Uint8Array([1]) })
    await uploadMedia('222', { 'a.mp3': new Uint8Array([1, 2]) })

    const object = await env.MEDIA.get(tempMediaKey('222', 'a.mp3'))
    expect(new Uint8Array(await object.arrayBuffer())).toEqual(new Uint8Array([1, 2]))
  })
})
