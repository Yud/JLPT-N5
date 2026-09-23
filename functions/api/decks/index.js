// GET /api/decks
// Lists every deck — built-in (defined in shared/data/decks.js) and imported
// (the decks table) — each with a name and card count (FR-008).

import { DECK_NAMES, DECKS } from '../../../shared/data/decks.js'

function displayName(id) {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

export async function onRequestGet(context) {
  const builtIn = Object.values(DECK_NAMES).map((id) => ({
    id,
    name: displayName(id),
    cardCount: DECKS[id].size,
    type: 'built-in',
  }))

  const { results } = await context.env.DB.prepare('SELECT id, name, card_count FROM decks').all()
  const imported = results.map((row) => ({ id: row.id, name: row.name, cardCount: row.card_count, type: 'imported' }))

  return Response.json({ decks: [...builtIn, ...imported] })
}
