// GET /api/decks/:deckId/cards
// Fetches an imported deck's cards for a review session — the imported-deck
// equivalent of built-in decks shipping their content in the client bundle.
// front/back already have media references resolved to /api/media/... URLs
// (rewritten at upload time by [deckId]/media.js).

export async function onRequestGet(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { deckId } = context.params
  const db = context.env.DB
  const deck = await db.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const { results } = await db.prepare('SELECT id, front, back FROM cards WHERE deck_id = ?').bind(deckId).all()
  return Response.json({ cards: results })
}
