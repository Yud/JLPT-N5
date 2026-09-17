import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function getDecks() {
  return exports.default.fetch('https://example.com/api/decks', { headers: AUTH })
}

async function deleteDeck(deckId) {
  return exports.default.fetch(`https://example.com/api/decks/${deckId}`, { method: 'DELETE', headers: AUTH })
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM media_assets')
  await env.DB.exec('DELETE FROM card_review_state')
  await env.DB.exec('DELETE FROM media_import_jobs')
})

describe('GET /api/decks', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks')
    expect(response.status).toBe(401)
  })

  it('lists built-in decks even with no imported decks', async () => {
    const { decks } = await (await getDecks()).json()
    const ids = decks.map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining(['hiragana', 'katakana', 'vocabulary']))
    expect(decks.every((d) => d.type === 'built-in')).toBe(true)
  })

  it('includes imported decks alongside built-in ones', async () => {
    await env.DB
      .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('444', 444, 'Imported Deck', 3, Date.now(), Date.now())
      .run()

    const { decks } = await (await getDecks()).json()
    const imported = decks.find((d) => d.id === '444')
    expect(imported).toEqual({ id: '444', name: 'Imported Deck', cardCount: 3, type: 'imported' })
  })
})

describe('DELETE /api/decks/:deckId', () => {
  async function seedDeckWithMediaAndReview() {
    await env.DB
      .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('555', 555, 'Doomed Deck', 1, Date.now(), Date.now())
      .run()
    await env.DB
      .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('imported-555-1', '555', 1, 'Front', 'Back', Date.now())
      .run()
    await env.DB
      .prepare('INSERT INTO media_assets (id, deck_id, filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)')
      .bind('asset-555', '555', 'a.mp3', 'audio/mpeg', 5)
      .run()
    await env.MEDIA.put('asset-555', new Uint8Array([1, 2, 3]))
    await env.DB
      .prepare('INSERT INTO card_review_state (user_email, card_id, due_at) VALUES (?, ?, ?)')
      .bind('test@example.com', 'imported-555-1', Date.now())
      .run()
    await env.DB
      .prepare('INSERT INTO media_import_jobs (id, deck_id, status, total, done, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('job-555', '555', 'processing', 1, 0, Date.now(), Date.now())
      .run()
  }

  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/555', { method: 'DELETE' })
    expect(response.status).toBe(401)
  })

  it('404s for an unknown deck', async () => {
    const response = await deleteDeck('not-a-deck')
    expect(response.status).toBe(404)
  })

  it('404s for a built-in deck id (FR-010)', async () => {
    const response = await deleteDeck('hiragana')
    expect(response.status).toBe(404)
  })

  it('cascades cards, media (D1 rows and R2 objects), and review history', async () => {
    await seedDeckWithMediaAndReview()

    const response = await deleteDeck('555')
    expect(response.status).toBe(204)

    expect(await env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind('555').first()).toBeNull()
    expect(await env.DB.prepare('SELECT * FROM cards WHERE deck_id = ?').bind('555').first()).toBeNull()
    expect(await env.DB.prepare('SELECT * FROM media_assets WHERE deck_id = ?').bind('555').first()).toBeNull()
    expect(await env.DB.prepare('SELECT * FROM card_review_state WHERE card_id = ?').bind('imported-555-1').first()).toBeNull()
    expect(await env.DB.prepare('SELECT * FROM media_import_jobs WHERE deck_id = ?').bind('555').first()).toBeNull()
    expect(await env.MEDIA.get('asset-555')).toBeNull()
  })

  it('does not affect other decks', async () => {
    await seedDeckWithMediaAndReview()
    await env.DB
      .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('666', 666, 'Safe Deck', 0, Date.now(), Date.now())
      .run()

    await deleteDeck('555')

    expect(await env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind('666').first()).not.toBeNull()
  })
})
