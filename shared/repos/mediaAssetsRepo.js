// All D1 access for the `media_assets` table (migrations/0003_create_imported_decks.sql).

// D1 caps bound parameters at 100 per query ("Maximum bound parameters per
// query", D1's own limits page) — this SELECT binds one `?` per filename
// plus one for deckId, so lookups are chunked in groups of this size
// (comfortably under 100 with deckId's +1).
const MAX_FILENAMES_PER_QUERY = 90

export async function getContentType(db, id) {
  return db.prepare('SELECT content_type FROM media_assets WHERE id = ?').bind(id).first()
}

export async function listIdsByDeckId(db, deckId) {
  const { results } = await db.prepare('SELECT id FROM media_assets WHERE deck_id = ?').bind(deckId).all()
  return results
}

// Reusing an existing id is only correct when the content actually hasn't
// changed — GET /api/media/:id serves it with an "immutable" cache header,
// promising a given id's bytes never change. Callers compare size_bytes
// against the incoming content to decide reuse vs. a fresh id.
export async function findExistingByFilenames(db, deckId, filenames) {
  const existingByFilename = new Map()
  for (let i = 0; i < filenames.length; i += MAX_FILENAMES_PER_QUERY) {
    const batch = filenames.slice(i, i + MAX_FILENAMES_PER_QUERY)
    const placeholders = batch.map(() => '?').join(', ')
    const { results } = await db
      .prepare(`SELECT id, filename, size_bytes FROM media_assets WHERE deck_id = ? AND filename IN (${placeholders})`)
      .bind(deckId, ...batch)
      .all()
    for (const row of results) existingByFilename.set(row.filename, row)
  }
  return existingByFilename
}

export function upsertStatement(db, { id, deckId, filename, contentType, sizeBytes }) {
  return db
    .prepare(
      `INSERT INTO media_assets (id, deck_id, filename, content_type, size_bytes)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (deck_id, filename) DO UPDATE SET id = excluded.id, content_type = excluded.content_type, size_bytes = excluded.size_bytes`
    )
    .bind(id, deckId, filename, contentType, sizeBytes)
}

export function deleteByDeckIdStatement(db, deckId) {
  return db.prepare('DELETE FROM media_assets WHERE deck_id = ?').bind(deckId)
}
