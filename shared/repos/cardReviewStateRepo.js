// All D1 access for the `card_review_state` table (migrations/0001_create_card_review_state.sql).

export async function get(db, { userEmail, cardId }) {
  return db
    .prepare(
      'SELECT due_at, interval_days, ease_factor, repetitions, lapses, first_reviewed_at FROM card_review_state WHERE user_email = ? AND card_id = ?'
    )
    .bind(userEmail, cardId)
    .first()
}

export async function listByUserEmail(db, userEmail) {
  const { results } = await db
    .prepare('SELECT card_id, due_at, first_reviewed_at FROM card_review_state WHERE user_email = ?')
    .bind(userEmail)
    .all()
  return results
}

export async function upsert(
  db,
  { userEmail, cardId, dueAt, intervalDays, easeFactor, repetitions, lapses, lastReviewedAt, firstReviewedAt }
) {
  await db
    .prepare(
      `INSERT INTO card_review_state (user_email, card_id, due_at, interval_days, ease_factor, repetitions, lapses, last_reviewed_at, first_reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_email, card_id) DO UPDATE SET
         due_at = excluded.due_at,
         interval_days = excluded.interval_days,
         ease_factor = excluded.ease_factor,
         repetitions = excluded.repetitions,
         lapses = excluded.lapses,
         last_reviewed_at = excluded.last_reviewed_at`
    )
    .bind(userEmail, cardId, dueAt, intervalDays, easeFactor, repetitions, lapses, lastReviewedAt, firstReviewedAt)
    .run()
}

// D1 caps bound parameters at 100 per query, well below a deck's card count
// — a subquery against `cards` rather than an explicit id list sidesteps
// that entirely. Must run before cards themselves are deleted.
export function deleteByDeckIdCardsStatement(db, deckId) {
  return db.prepare('DELETE FROM card_review_state WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)').bind(deckId)
}
