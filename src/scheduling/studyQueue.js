const DAY_MS = 24 * 60 * 60 * 1000

// Anki's own default (Settings > Daily Limits > New cards/day).
export const DEFAULT_NEW_CARDS_PER_DAY = 20

export function startOfUtcDay(now) {
  return Math.floor(now / DAY_MS) * DAY_MS
}

/**
 * Builds a deck's per-card status list plus the subset actually worth
 * studying right now — every due card (uncapped) plus new cards up to
 * today's remaining new-card budget. Pure/D1-free so it's unit-testable in
 * isolation, same split as scheduler.js.
 *
 * `cardIds` should already exclude suspended cards. `reviewByCardId` maps a
 * card id to its `card_review_state` row (or undefined for a never-reviewed
 * card) — only `due_at` and `first_reviewed_at` are read.
 */
export function buildStudyQueue({ cardIds, reviewByCardId, now = Date.now(), newCardsPerDay = DEFAULT_NEW_CARDS_PER_DAY }) {
  const todayStart = startOfUtcDay(now)
  // Counted by first_reviewed_at, not by status === 'new': a card graded for
  // the first time today already has due_at set (status 'due'/'scheduled'),
  // but must still count against today's budget — status alone can't tell
  // "new" apart from "first reviewed today".
  let introducedToday = 0
  for (const state of reviewByCardId.values()) {
    if (state?.first_reviewed_at != null && state.first_reviewed_at >= todayStart) introducedToday++
  }
  const newBudget = Math.max(0, newCardsPerDay - introducedToday)

  const cards = []
  const due = []
  const fresh = []
  for (const cardId of cardIds) {
    const state = reviewByCardId.get(cardId)
    const dueAt = state?.due_at ?? null
    const status = dueAt === null ? 'new' : dueAt <= now ? 'due' : 'scheduled'
    cards.push({ cardId, status, dueAt })
    if (status === 'due') due.push(cardId)
    else if (status === 'new') fresh.push(cardId)
  }

  return { cards, queue: [...due, ...fresh.slice(0, newBudget)] }
}
