// DELETE /api/decks/:deckId
// Removes an imported deck: its cards, its media (D1 rows and the backing R2
// objects), its cards' media-reference index rows, and its cards' review
// history. 404s for both an unknown id and any built-in deck id, since
// built-in decks never have a row in the decks table (FR-010 is satisfied by
// construction, not a special-cased check).

export async function onRequestDelete(context) {
  const { deckId } = context.params
  const db = context.env.DB
  const deck = await db.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const { results: mediaRows } = await db.prepare('SELECT id FROM media_assets WHERE deck_id = ?').bind(deckId).all()

  // Chunked, not one call: R2's delete() takes an array, but a deck can
  // have thousands of media assets and this shouldn't assume an unbounded
  // batch size.
  const R2_DELETE_BATCH_SIZE = 1000
  for (let i = 0; i < mediaRows.length; i += R2_DELETE_BATCH_SIZE) {
    const keys = mediaRows.slice(i, i + R2_DELETE_BATCH_SIZE).map((row) => row.id)
    await context.env.MEDIA.delete(keys)
  }

  // card_review_state cleanup uses a subquery against `cards` rather than
  // an explicit id list — D1 caps bound parameters at 100 per query (same
  // limit functions/api/reviews/due.js works around), well below a deck's
  // card count — so this must run before `cards` itself is deleted below.
  await db.batch([
    db.prepare('DELETE FROM card_review_state WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)').bind(deckId),
    db.prepare('DELETE FROM card_suspensions WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)').bind(deckId),
    // card_media_refs has no foreign key to cards/decks (see
    // migrations/0009_create_card_media_refs.sql), so nothing removes these
    // rows implicitly — without this, deleting a deck that's never reimported
    // leaves its whole reference index behind permanently. A reimport of the
    // same deck would eventually clear them (upsertCardChunk deletes each
    // card's stale refs before writing fresh ones, and card ids are
    // deterministic), which is why this gap stayed invisible.
    db.prepare('DELETE FROM card_media_refs WHERE deck_id = ?').bind(deckId),
    db.prepare('DELETE FROM media_assets WHERE deck_id = ?').bind(deckId),
    db.prepare('DELETE FROM cards WHERE deck_id = ?').bind(deckId),
    db.prepare('DELETE FROM decks WHERE id = ?').bind(deckId),
  ])

  return new Response(null, { status: 204 })
}
