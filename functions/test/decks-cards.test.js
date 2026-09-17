import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB
    .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('333', 333, 'Cards Deck', 1, Date.now(), Date.now())
    .run()
  await env.DB
    .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('imported-333-1', '333', 1, 'Front', 'Back', Date.now())
    .run()
})

describe('GET /api/decks/:deckId/cards', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/333/cards')
    expect(response.status).toBe(401)
  })

  it('404s for an unknown deck', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/not-a-deck/cards', { headers: AUTH })
    expect(response.status).toBe(404)
  })

  it("returns the deck's cards", async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/333/cards', { headers: AUTH })
    expect(response.status).toBe(200)
    const { cards } = await response.json()
    expect(cards).toEqual([{ id: 'imported-333-1', front: 'Front', back: 'Back' }])
  })
})
