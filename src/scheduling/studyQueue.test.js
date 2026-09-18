import { describe, it, expect } from 'vitest'
import { buildStudyQueue, startOfUtcDay } from './studyQueue.js'

const NOW = Date.parse('2026-08-16T12:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const TODAY_START = startOfUtcDay(NOW)
const YESTERDAY_START = TODAY_START - DAY_MS

describe('buildStudyQueue', () => {
  it('includes every due card uncapped, even past the new-card budget', () => {
    const cardIds = Array.from({ length: 30 }, (_, i) => `due-${i}`)
    const reviewByCardId = new Map(cardIds.map((id) => [id, { due_at: NOW - 1000, first_reviewed_at: YESTERDAY_START }]))
    const { queue, cards } = buildStudyQueue({ cardIds, reviewByCardId, now: NOW, newCardsPerDay: 5 })
    expect(queue).toHaveLength(30)
    expect(cards.every((c) => c.status === 'due')).toBe(true)
  })

  it('caps new cards at newCardsPerDay', () => {
    const cardIds = Array.from({ length: 10 }, (_, i) => `new-${i}`)
    const { queue, cards } = buildStudyQueue({ cardIds, reviewByCardId: new Map(), now: NOW, newCardsPerDay: 3 })
    expect(queue).toHaveLength(3)
    expect(cards.every((c) => c.status === 'new')).toBe(true)
  })

  it("doesn't count a card first reviewed on a prior day against today's budget", () => {
    const cardIds = ['old', 'new-1']
    const reviewByCardId = new Map([['old', { due_at: NOW + DAY_MS, first_reviewed_at: YESTERDAY_START }]])
    const { queue } = buildStudyQueue({ cardIds, reviewByCardId, now: NOW, newCardsPerDay: 1 })
    // 'old' is scheduled (not due, not new) so it never enters the queue;
    // 'new-1' should still get its full budget since 'old' doesn't consume it.
    expect(queue).toEqual(['new-1'])
  })

  it('only consumes one budget slot for a card reviewed twice today', () => {
    const cardIds = ['reviewed-twice', 'new-1', 'new-2']
    const reviewByCardId = new Map([['reviewed-twice', { due_at: NOW + DAY_MS, first_reviewed_at: TODAY_START + 1000 }]])
    const { queue } = buildStudyQueue({ cardIds, reviewByCardId, now: NOW, newCardsPerDay: 2 })
    // budget is 2 - 1 (already introduced today) = 1, so only one of the two fresh cards fits.
    expect(queue).toEqual(['new-1'])
  })

  it('excludes scheduled (not-yet-due) cards from the queue', () => {
    const cardIds = ['scheduled']
    const reviewByCardId = new Map([['scheduled', { due_at: NOW + DAY_MS, first_reviewed_at: YESTERDAY_START }]])
    const { queue, cards } = buildStudyQueue({ cardIds, reviewByCardId, now: NOW })
    expect(queue).toEqual([])
    expect(cards[0].status).toBe('scheduled')
  })
})
