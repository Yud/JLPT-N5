// GET /api/reviews/due?deck=<id>
// Returns `cards`: every non-suspended card in the deck with its review
// status, and `queue`: the subset actually worth studying right now (every
// due card, uncapped, plus new cards up to today's remaining new-card
// budget — shared/scheduling/studyQueue.js). Card content (front/back) is
// included on `queue` entries only, and only for imported decks — built-in
// decks' content (kana/romaji/etc.) already lives in code (shared/data/*.js)
// and the client has it, so duplicating it here would balloon the response
// for no reason.

import { DECKS } from '../../../shared/data/decks.js'
import { buildStudyQueue } from '../../../shared/scheduling/studyQueue.js'
import * as cardsRepo from '../../../shared/repos/cardsRepo.js'
import * as cardSuspensionsRepo from '../../../shared/repos/cardSuspensionsRepo.js'
import * as cardReviewStateRepo from '../../../shared/repos/cardReviewStateRepo.js'

export async function onRequestGet(context) {
  const { email } = context.data
  const deck = new URL(context.request.url).searchParams.get('deck')
  const db = context.env.DB
  let cardIds = DECKS[deck]
  const isImported = !cardIds

  let contentByCardId = new Map()
  if (isImported) {
    // Not a built-in deck — check whether it's an imported one
    // (specs/003-anki-deck-import) before giving up.
    const results = await cardsRepo.listByDeckId(db, deck)
    if (results.length === 0) return new Response(`Unknown deck: ${deck}`, { status: 404 })
    cardIds = new Set(results.map((row) => row.id))
    contentByCardId = new Map(results.map((row) => [row.id, { front: row.front, back: row.back }]))
  }

  // Fetch all of this user's suspensions/review rows in one
  // unparameterized-by-id query rather than binding one placeholder per
  // card id — D1 caps bound parameters at 100 per query, well below a
  // deck's card count.
  const [suspensions, reviewRows] = await Promise.all([
    cardSuspensionsRepo.listCardIdsByUserEmail(db, email),
    cardReviewStateRepo.listByUserEmail(db, email),
  ])

  const suspendedIds = new Set(suspensions.map((row) => row.card_id))
  const ids = [...cardIds].filter((id) => !suspendedIds.has(id))
  const reviewByCardId = new Map(
    reviewRows.filter((r) => cardIds.has(r.card_id)).map((r) => [r.card_id, { due_at: r.due_at, first_reviewed_at: r.first_reviewed_at }])
  )

  const { cards, queue } = buildStudyQueue({ cardIds: ids, reviewByCardId })
  const statusByCardId = new Map(cards.map((c) => [c.cardId, c.status]))

  return Response.json({
    cards,
    queue: queue.map((cardId) => {
      const content = contentByCardId.get(cardId)
      return content ? { cardId, status: statusByCardId.get(cardId), ...content } : { cardId, status: statusByCardId.get(cardId) }
    }),
  })
}
