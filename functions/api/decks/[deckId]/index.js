// DELETE /api/decks/:deckId
// Removes an imported deck: its cards, its media (D1 rows and the backing R2
// objects), its cards' media-reference index rows, and its cards' review
// history. 404s for both an unknown id and any built-in deck id, since
// built-in decks never have a row in the decks table (FR-010 is satisfied by
// construction, not a special-cased check).

import * as decksRepo from '../../../../shared/repos/decksRepo.js'
import * as cardsRepo from '../../../../shared/repos/cardsRepo.js'
import * as mediaAssetsRepo from '../../../../shared/repos/mediaAssetsRepo.js'
import * as cardReviewStateRepo from '../../../../shared/repos/cardReviewStateRepo.js'
import * as cardSuspensionsRepo from '../../../../shared/repos/cardSuspensionsRepo.js'
import * as cardMediaRefsRepo from '../../../../shared/repos/cardMediaRefsRepo.js'

export async function onRequestDelete(context) {
  const { deckId } = context.params
  const db = context.env.DB
  const deck = await decksRepo.getById(db, deckId)
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const mediaRows = await mediaAssetsRepo.listIdsByDeckId(db, deckId)

  // Chunked, not one call: R2's delete() takes an array, but a deck can
  // have thousands of media assets and this shouldn't assume an unbounded
  // batch size.
  const R2_DELETE_BATCH_SIZE = 1000
  for (let i = 0; i < mediaRows.length; i += R2_DELETE_BATCH_SIZE) {
    const keys = mediaRows.slice(i, i + R2_DELETE_BATCH_SIZE).map((row) => row.id)
    await context.env.MEDIA.delete(keys)
  }

  // card_review_state/card_suspensions cleanup uses a subquery against
  // `cards` rather than an explicit id list — D1 caps bound parameters at
  // 100 per query (same limit functions/api/reviews/due.js works around),
  // well below a deck's card count — so this must run before `cards` itself
  // is deleted below.
  await db.batch([
    cardReviewStateRepo.deleteByDeckIdCardsStatement(db, deckId),
    cardSuspensionsRepo.deleteByDeckIdCardsStatement(db, deckId),
    // card_media_refs has no foreign key to cards/decks (see
    // migrations/0009_create_card_media_refs.sql), so nothing removes these
    // rows implicitly — without this, deleting a deck that's never reimported
    // leaves its whole reference index behind permanently. A reimport of the
    // same deck would eventually clear them (upsertCardChunk deletes each
    // card's stale refs before writing fresh ones, and card ids are
    // deterministic), which is why this gap stayed invisible.
    cardMediaRefsRepo.deleteByDeckIdStatement(db, deckId),
    mediaAssetsRepo.deleteByDeckIdStatement(db, deckId),
    cardsRepo.deleteByDeckIdStatement(db, deckId),
    decksRepo.deleteByIdStatement(db, deckId),
  ])

  return new Response(null, { status: 204 })
}
