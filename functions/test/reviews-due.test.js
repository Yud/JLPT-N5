// Covers GET /api/reviews/due's queue-building (due-queue + daily new-card
// cap) and POST/DELETE /api/reviews/:cardId/suspend — reviews.test.js keeps
// the original grading/due-status coverage, this file is the newer
// queue/cap/suspend surface layered on top of it.
import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }
const DECK_ID = '900'

async function postReview(cardId, grade) {
  return exports.default.fetch(`https://example.com/api/reviews/${cardId}`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade }),
  })
}

async function getDue(deck = DECK_ID) {
  return exports.default.fetch(`https://example.com/api/reviews/due?deck=${deck}`, { headers: AUTH })
}

async function suspend(cardId) {
  return exports.default.fetch(`https://example.com/api/reviews/${cardId}/suspend`, { method: 'POST', headers: AUTH })
}

async function unsuspend(cardId) {
  return exports.default.fetch(`https://example.com/api/reviews/${cardId}/suspend`, { method: 'DELETE', headers: AUTH })
}

async function seedDeck(cardCount) {
  await env.DB
    .prepare('INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(DECK_ID, 900, 'Queue Test Deck', cardCount, Date.now(), Date.now())
    .run()
  for (let i = 0; i < cardCount; i++) {
    await env.DB
      .prepare('INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`imported-${DECK_ID}-${i}`, DECK_ID, i, `Front ${i}`, `Back ${i}`, Date.now())
      .run()
  }
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM card_review_state')
  await env.DB.exec('DELETE FROM card_suspensions')
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
})

describe('GET /api/reviews/due — queue', () => {
  it('includes front/back for imported cards but not built-in ones', async () => {
    await seedDeck(1)
    const { queue } = await (await getDue()).json()
    expect(queue).toEqual([{ cardId: `imported-${DECK_ID}-0`, status: 'new', front: 'Front 0', back: 'Back 0' }])

    const { queue: builtInQueue } = await (await getDue('hiragana')).json()
    expect(builtInQueue[0].front).toBeUndefined()
  })

  it('caps new cards at 20 per day but never caps due cards', async () => {
    await seedDeck(25)
    // Make every card due (not new) by grading it once, then re-grading with
    // "again" so it's immediately due again but no longer counts as "new".
    for (let i = 0; i < 25; i++) await postReview(`imported-${DECK_ID}-${i}`, 'again')

    const { queue } = await (await getDue()).json()
    expect(queue).toHaveLength(25) // all due, uncapped
    expect(queue.every((c) => c.status === 'due')).toBe(true)
  })

  it('caps a deck of all-new cards at 20', async () => {
    await seedDeck(25)
    const { queue } = await (await getDue()).json()
    expect(queue).toHaveLength(20)
  })

  it("a card reviewed twice today only consumes one slot of today's new-card budget", async () => {
    await seedDeck(21)
    // Grade card 0 twice (same day) — should only count once against the budget.
    await postReview(`imported-${DECK_ID}-0`, 'good')
    await postReview(`imported-${DECK_ID}-0`, 'good')

    const { queue } = await (await getDue()).json()
    // card 0 is now 'scheduled' (due tomorrow), not in queue. The other 20
    // cards are still 'new' — budget is 20 - 1 (introduced today) = 19, so
    // exactly 19 of them should make it into the queue.
    const newInQueue = queue.filter((c) => c.status === 'new')
    expect(newInQueue).toHaveLength(19)
  })
})

describe('suspend', () => {
  it('excludes a suspended card from both cards and queue', async () => {
    await seedDeck(2)
    const target = `imported-${DECK_ID}-0`

    const suspendResponse = await suspend(target)
    expect(suspendResponse.status).toBe(204)

    const { cards, queue } = await (await getDue()).json()
    expect(cards.find((c) => c.cardId === target)).toBeUndefined()
    expect(queue.find((c) => c.cardId === target)).toBeUndefined()
    expect(cards).toHaveLength(1)
  })

  it('404s suspending an unknown card id', async () => {
    const response = await suspend('not-a-real-card')
    expect(response.status).toBe(404)
  })

  it('round-trips: unsuspending restores the card', async () => {
    await seedDeck(1)
    const target = `imported-${DECK_ID}-0`

    await suspend(target)
    expect((await unsuspend(target)).status).toBe(204)

    const { cards } = await (await getDue()).json()
    expect(cards.find((c) => c.cardId === target)).toBeDefined()
  })

  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/reviews/some-card/suspend', { method: 'POST' })
    expect(response.status).toBe(401)
  })
})

describe('grading vs. the queue cap', () => {
  it('still accepts a grade for a card not currently in queue (cap is advisory only)', async () => {
    await seedDeck(21)
    // Card 20 is guaranteed to be outside the 20-new-card queue.
    const response = await postReview(`imported-${DECK_ID}-20`, 'good')
    expect(response.status).toBe(200)
  })
})
