import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function importDeck(body) {
  return exports.default.fetch('https://example.com/api/decks/import', {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const SAMPLE_DECK = {
  ankiDeckId: 111,
  deckName: 'Sample Deck',
  cards: [
    { ankiNoteId: 1, front: 'Q1', back: 'A1', media: [{ filename: 'a.mp3', sizeBytes: 10 }] },
    { ankiNoteId: 2, front: 'Q2', back: 'A2', media: [] },
  ],
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM media_assets')
})

describe('POST /api/decks/import', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/decks/import', { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('rejects a malformed body', async () => {
    const response = await importDeck({ deckName: 'x' })
    expect(response.status).toBe(400)
  })

  it('creates a new deck and its cards, reporting all media as needed', async () => {
    const response = await importDeck(SAMPLE_DECK)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ deckId: '111', cardCount: 2, mediaNeeded: ['a.mp3'] })

    const deckRow = await env.DB.prepare('SELECT * FROM decks WHERE id = ?').bind('111').first()
    expect(deckRow).toMatchObject({ name: 'Sample Deck', card_count: 2 })

    const { results: cardRows } = await env.DB.prepare('SELECT * FROM cards WHERE deck_id = ? ORDER BY anki_note_id').bind('111').all()
    expect(cardRows).toHaveLength(2)
    expect(cardRows[0]).toMatchObject({ id: 'imported-111-1', front: 'Q1', back: 'A1' })
  })

  it('re-importing the same deck updates it in place rather than duplicating it (FR-012)', async () => {
    await importDeck(SAMPLE_DECK)
    const updated = {
      ankiDeckId: 111,
      deckName: 'Sample Deck (renamed)',
      cards: [{ ankiNoteId: 1, front: 'Q1 updated', back: 'A1', media: [] }],
    }
    const response = await importDeck(updated)
    const body = await response.json()
    expect(body.deckId).toBe('111')

    const { results: deckRows } = await env.DB.prepare('SELECT * FROM decks').all()
    expect(deckRows).toHaveLength(1)
    expect(deckRows[0]).toMatchObject({ name: 'Sample Deck (renamed)', card_count: 1 })

    const card = await env.DB.prepare('SELECT * FROM cards WHERE id = ?').bind('imported-111-1').first()
    expect(card.front).toBe('Q1 updated')
  })

  it('does not report already-uploaded, byte-identical media as needed on re-import', async () => {
    await importDeck(SAMPLE_DECK)
    await env.DB
      .prepare('INSERT INTO media_assets (id, deck_id, filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)')
      .bind('asset-1', '111', 'a.mp3', 'audio/mpeg', 10)
      .run()

    const response = await importDeck(SAMPLE_DECK)
    const body = await response.json()
    expect(body.mediaNeeded).toEqual([])
  })
})
