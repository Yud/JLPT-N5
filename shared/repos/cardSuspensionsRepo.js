// All D1 access for the `card_suspensions` table (migrations/0006_create_card_suspensions.sql).

export async function listCardIdsByUserEmail(db, userEmail) {
  const { results } = await db.prepare('SELECT card_id FROM card_suspensions WHERE user_email = ?').bind(userEmail).all()
  return results
}

export async function insert(db, { userEmail, cardId, suspendedAt }) {
  await db
    .prepare(
      'INSERT INTO card_suspensions (user_email, card_id, suspended_at) VALUES (?, ?, ?) ON CONFLICT (user_email, card_id) DO NOTHING'
    )
    .bind(userEmail, cardId, suspendedAt)
    .run()
}

export async function remove(db, { userEmail, cardId }) {
  await db.prepare('DELETE FROM card_suspensions WHERE user_email = ? AND card_id = ?').bind(userEmail, cardId).run()
}

export function deleteByDeckIdCardsStatement(db, deckId) {
  return db.prepare('DELETE FROM card_suspensions WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)').bind(deckId)
}
