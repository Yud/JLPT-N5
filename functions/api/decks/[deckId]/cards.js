// GET /api/decks/:deckId/cards
// Fetches an imported deck's cards for a review session — the imported-deck
// equivalent of built-in decks shipping their content in the client bundle.
// front/back already have media references resolved to /api/media/... URLs
// (rewritten at upload time by [deckId]/media.js).

import * as decksRepo from '../../../../shared/repos/decksRepo.js'
import * as cardsRepo from '../../../../shared/repos/cardsRepo.js'

export async function onRequestGet(context) {
  const { deckId } = context.params
  const db = context.env.DB
  const deck = await decksRepo.getById(db, deckId)
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const results = await cardsRepo.listByDeckId(db, deckId)
  return Response.json({ cards: results })
}
