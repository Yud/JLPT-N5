import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function postReview(cardId, grade) {
  return exports.default.fetch(`https://example.com/api/reviews/${cardId}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade }),
  })
}

async function getDue(deck = 'hiragana') {
  return exports.default.fetch(`https://example.com/api/reviews/due?deck=${deck}`, { headers: AUTH })
}

// Storage isolation is per test *file*, not per test — clear explicitly so
// each test starts from a clean review-state table regardless.
beforeEach(async () => {
  await env.DB.exec('DELETE FROM card_review_state')
  await env.DB.exec('DELETE FROM card_suspensions')
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
})

// specs/003-anki-deck-import, research.md §6: imported card ids (not in the
// static DECKS registry) must be recognized too, not just built-in ones.
async function seedImportedCard() {
  await env.DB
    .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('777', 777, 'Imported Deck', 1, Date.now(), Date.now())
    .run()
  await env.DB
    .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('imported-777-1', '777', 1, 'Front', 'Back', Date.now())
    .run()
}

describe('GET /api/reviews/due', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/reviews/due?deck=hiragana')
    expect(response.status).toBe(401)
  })

  it('rejects an unknown deck', async () => {
    const response = await getDue('not-a-deck')
    expect(response.status).toBe(404)
  })

  it('reports every card as new when nothing has been reviewed', async () => {
    const { cards } = await (await getDue()).json()
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c) => c.status === 'new' && c.dueAt === null)).toBe(true)
  })
})

describe('POST /api/reviews/:cardId', () => {
  it('rejects an invalid grade', async () => {
    const response = await postReview('hiragana-ki', 'terrible')
    expect(response.status).toBe(400)
  })

  it('rejects an unknown card id', async () => {
    const response = await postReview('not-a-real-card', 'good')
    expect(response.status).toBe(404)
  })

  it('persists a review so it shows up as scheduled on the next due check', async () => {
    const reviewResponse = await postReview('hiragana-ki', 'good')
    expect(reviewResponse.status).toBe(200)
    const reviewed = await reviewResponse.json()
    expect(reviewed).toMatchObject({ cardId: 'hiragana-ki', repetitions: 1, interval_days: 1 })

    const { cards } = await (await getDue()).json()
    const ki = cards.find((c) => c.cardId === 'hiragana-ki')
    expect(ki.status).toBe('scheduled')
    expect(ki.dueAt).toBe(reviewed.due_at)
  })

  it('upserts on repeated reviews of the same card', async () => {
    await postReview('hiragana-ki', 'good')
    const second = await (await postReview('hiragana-ki', 'good')).json()
    expect(second.repetitions).toBe(2)

    const { results } = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM card_review_state WHERE user_email = ? AND card_id = ?')
      .bind('test@example.com', 'hiragana-ki')
      .all()
    expect(results[0].n).toBe(1)
  })

  it('resets repetitions and bumps lapses on "again"', async () => {
    await postReview('hiragana-ki', 'good')
    const lapsed = await (await postReview('hiragana-ki', 'again')).json()
    expect(lapsed.repetitions).toBe(0)
    expect(lapsed.lapses).toBe(1)
  })

  it('accepts an imported card id and reflects it on the next due check for its deck', async () => {
    await seedImportedCard()

    const reviewResponse = await postReview('imported-777-1', 'good')
    expect(reviewResponse.status).toBe(200)

    const { cards } = await (await getDue('777')).json()
    expect(cards).toEqual([{ cardId: 'imported-777-1', status: 'scheduled', dueAt: expect.any(Number) }])
  })
})
