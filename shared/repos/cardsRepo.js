// All D1 access for the `cards` table (migrations/0003_create_imported_decks.sql).

export async function exists(db, id) {
  return Boolean(await db.prepare('SELECT 1 FROM cards WHERE id = ?').bind(id).first())
}

// id/front/back for a deck's cards — used both for the review-session fetch
// (GET /api/decks/:deckId/cards) and for building the due-review queue (GET
// /api/reviews/due), which need the identical shape.
export async function listByDeckId(db, deckId) {
  const { results } = await db.prepare('SELECT id, front, back FROM cards WHERE deck_id = ?').bind(deckId).all()
  return results
}

export function upsertStatement(db, { id, deckId, ankiNoteId, front, back, updatedAt }) {
  return db
    .prepare(
      `INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (deck_id, anki_note_id) DO UPDATE SET
         front = excluded.front,
         back = excluded.back,
         updated_at = excluded.updated_at`
    )
    .bind(id, deckId, ankiNoteId, front, back, updatedAt)
}

// Rewrites a raw Anki media reference (`[sound:filename]`, `src="filename"`,
// src='filename') to the permanent /api/media/<id> URL, once the file's
// media_assets id is known. REPLACE() (a plain substring operation, not
// pattern-based) — D1 rejects long/complex LIKE patterns for the long,
// content-hash-style filenames real Anki media commonly uses, which
// REPLACE() has no such limit on.
export function rewriteMediaReferenceStatement(db, { cardId, filename, mediaUrl }) {
  return db
    .prepare(
      `UPDATE cards SET
         front = REPLACE(REPLACE(REPLACE(front, ?, ?), ?, ?), ?, ?),
         back  = REPLACE(REPLACE(REPLACE(back,  ?, ?), ?, ?), ?, ?)
       WHERE id = ?`
    )
    .bind(
      `[sound:${filename}]`,
      `[sound:${mediaUrl}]`,
      `src="${filename}"`,
      `src="${mediaUrl}"`,
      `src='${filename}'`,
      `src='${mediaUrl}'`,
      `[sound:${filename}]`,
      `[sound:${mediaUrl}]`,
      `src="${filename}"`,
      `src="${mediaUrl}"`,
      `src='${filename}'`,
      `src='${mediaUrl}'`,
      cardId
    )
}

export function deleteByDeckIdStatement(db, deckId) {
  return db.prepare('DELETE FROM cards WHERE deck_id = ?').bind(deckId)
}
