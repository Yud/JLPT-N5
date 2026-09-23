// All D1 access for the `card_media_refs` table — the indexed reverse
// lookup (filename -> card_id) that lets media-chunk processing rewrite
// card references without scanning every card in a deck (migrations/
// 0009_create_card_media_refs.sql, 0010_add_card_media_refs_card_index.sql).

// D1 caps bound parameters at 100 per query — this SELECT binds one `?` per
// filename plus one for deckId, so lookups are chunked in groups of this size.
const MAX_FILENAMES_PER_QUERY = 90

export async function listCardIdsByFilenames(db, deckId, filenames) {
  const cardIdsByFilename = new Map()
  for (let i = 0; i < filenames.length; i += MAX_FILENAMES_PER_QUERY) {
    const batch = filenames.slice(i, i + MAX_FILENAMES_PER_QUERY)
    const placeholders = batch.map(() => '?').join(', ')
    const { results } = await db
      .prepare(`SELECT filename, card_id FROM card_media_refs WHERE deck_id = ? AND filename IN (${placeholders})`)
      .bind(deckId, ...batch)
      .all()
    for (const row of results) {
      const cardIds = cardIdsByFilename.get(row.filename) ?? []
      cardIds.push(row.card_id)
      cardIdsByFilename.set(row.filename, cardIds)
    }
  }
  return cardIdsByFilename
}

// Deleted by (deck_id, card_id) — NOT a prefix of the table's own PK
// (deck_id, filename, card_id), which skips `filename`. migrations/
// 0010_add_card_media_refs_card_index.sql adds the (deck_id, card_id) index
// this needs — see that migration for the production incident (a 716-call
// import reading 3.22M rows) it fixed.
export function deleteByCardIdStatement(db, deckId, cardId) {
  return db.prepare('DELETE FROM card_media_refs WHERE deck_id = ? AND card_id = ?').bind(deckId, cardId)
}

export function insertStatement(db, { deckId, filename, cardId }) {
  return db.prepare('INSERT INTO card_media_refs (deck_id, filename, card_id) VALUES (?, ?, ?)').bind(deckId, filename, cardId)
}

export function deleteByDeckIdStatement(db, deckId) {
  return db.prepare('DELETE FROM card_media_refs WHERE deck_id = ?').bind(deckId)
}
