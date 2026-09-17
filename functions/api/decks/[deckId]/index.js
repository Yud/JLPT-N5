// DELETE /api/decks/:deckId
// Removes an imported deck: its cards, its media (D1 rows and the backing R2
// objects), and its cards' review history. 404s for both an unknown id and
// any built-in deck id, since built-in decks never have a row in the decks
// table (FR-010 is satisfied by construction, not a special-cased check).

export async function onRequestDelete(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { deckId } = context.params
  const db = context.env.DB
  const deck = await db.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const [{ results: mediaRows }, { results: cardRows }] = await Promise.all([
    db.prepare('SELECT id FROM media_assets WHERE deck_id = ?').bind(deckId).all(),
    db.prepare('SELECT id FROM cards WHERE deck_id = ?').bind(deckId).all(),
  ])

  if (mediaRows.length > 0) await context.env.MEDIA.delete(mediaRows.map((row) => row.id))

  const writes = [
    db.prepare('DELETE FROM media_assets WHERE deck_id = ?').bind(deckId),
    db.prepare('DELETE FROM cards WHERE deck_id = ?').bind(deckId),
    db.prepare('DELETE FROM decks WHERE id = ?').bind(deckId),
  ]
  if (cardRows.length > 0) {
    const placeholders = cardRows.map(() => '?').join(', ')
    writes.push(
      db
        .prepare(`DELETE FROM card_review_state WHERE card_id IN (${placeholders})`)
        .bind(...cardRows.map((row) => row.id))
    )
  }
  await db.batch(writes)

  return new Response(null, { status: 204 })
}
