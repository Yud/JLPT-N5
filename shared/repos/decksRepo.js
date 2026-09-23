// All D1 access for the `decks` table (migrations/0003_create_imported_decks.sql).

export async function getById(db, id) {
  return db.prepare('SELECT id FROM decks WHERE id = ?').bind(id).first()
}

export async function list(db) {
  const { results } = await db.prepare('SELECT id, name, card_count FROM decks').all()
  return results
}

export async function upsert(db, { id, ankiDeckId, name, cardCount }) {
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (anki_deck_id) DO UPDATE SET
         name = excluded.name,
         card_count = excluded.card_count,
         updated_at = excluded.updated_at`
    )
    .bind(id, ankiDeckId, name, cardCount, now, now)
    .run()
}

export function deleteByIdStatement(db, id) {
  return db.prepare('DELETE FROM decks WHERE id = ?').bind(id)
}
