// GET /api/reviews/due?deck=hiragana
// Returns every card in the deck with its review status. Card content
// (kana/romaji/etc.) intentionally isn't included here — it lives in code
// (src/data/*.js) and the client already has it; this endpoint only reports
// per-user scheduling state.

import { DECKS } from '../../../src/data/decks.js'

export async function onRequestGet(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const deck = new URL(context.request.url).searchParams.get('deck')
  const cardIds = DECKS[deck]
  if (!cardIds) return new Response(`Unknown deck: ${deck}`, { status: 400 })

  // Fetch all of this user's review rows in one unparameterized-by-id query
  // rather than binding one placeholder per card id — D1 caps bound
  // parameters at 100 per query, well below a deck's card count.
  const { results } = await context.env.DB
    .prepare('SELECT card_id, due_at FROM card_review_state WHERE user_email = ?')
    .bind(email)
    .all()

  const ids = [...cardIds]
  const dueAtById = new Map(results.filter((r) => cardIds.has(r.card_id)).map((r) => [r.card_id, r.due_at]))
  const now = Date.now()

  const cards = ids.map((cardId) => {
    const dueAt = dueAtById.get(cardId)
    const status = dueAt === undefined ? 'new' : dueAt <= now ? 'due' : 'scheduled'
    return { cardId, status, dueAt: dueAt ?? null }
  })

  return Response.json({ cards })
}
