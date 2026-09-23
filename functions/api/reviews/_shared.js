// Leading underscore keeps Cloudflare Pages Functions from treating this as
// a route (same convention as _middleware.js) — shared by [cardId].js and
// [cardId]/suspend.js, which both need to reject an id that's neither a
// built-in card nor a row in the imported `cards` table.

import { DECKS } from '../../../shared/data/decks.js'
import * as cardsRepo from '../../../shared/repos/cardsRepo.js'

const ALL_BUILTIN_CARD_IDS = new Set(Object.values(DECKS).flatMap((set) => [...set]))

export async function isKnownCardId(db, cardId) {
  if (ALL_BUILTIN_CARD_IDS.has(cardId)) return true
  return cardsRepo.exists(db, cardId)
}
