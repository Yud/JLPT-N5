// All D1 access for the `deck_import_jobs` table (migrations/0007_create_deck_import_jobs.sql).

export async function create(db, { id, r2Key }) {
  const now = Date.now()
  await db
    .prepare(`INSERT INTO deck_import_jobs (id, r2_key, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)`)
    .bind(id, r2Key, now, now)
    .run()
}

export async function getById(db, id) {
  return db.prepare('SELECT * FROM deck_import_jobs WHERE id = ?').bind(id).first()
}

export async function updateDecksTotal(db, { id, decksTotal }) {
  await db.prepare(`UPDATE deck_import_jobs SET decks_total = ?, updated_at = ? WHERE id = ?`).bind(decksTotal, Date.now(), id).run()
}

export async function incrementDecksDone(db, id) {
  await db.prepare(`UPDATE deck_import_jobs SET decks_done = decks_done + 1, updated_at = ? WHERE id = ?`).bind(Date.now(), id).run()
}

export async function markProcessing(db, id) {
  await db.prepare(`UPDATE deck_import_jobs SET status = 'processing', updated_at = ? WHERE id = ?`).bind(Date.now(), id).run()
}

/** Unconditional — used when the job isn't concurrently touched by anything else (trigger-start failure, scatter-phase failure). */
export async function markError(db, { id, error }) {
  await db.prepare(`UPDATE deck_import_jobs SET status = 'error', error = ?, updated_at = ? WHERE id = ?`).bind(error, Date.now(), id).run()
}

// Guarded so a media-chunk failure can't stomp a job that already finished
// ('done') or already recorded an earlier error from a sibling chunk —
// unlike markError, this can race with other chunks finishing concurrently.
export async function markErrorIfNotFinished(db, { id, error }) {
  await db
    .prepare(
      `UPDATE deck_import_jobs SET status = 'error', error = ?, updated_at = ?
       WHERE id = ? AND status != 'done' AND status != 'error'`
    )
    .bind(error, Date.now(), id)
    .run()
}

/**
 * Marks the job done iff it's still 'processing' — safe to call from
 * multiple concurrent finishers racing to be "last" (only whichever call's
 * UPDATE actually matches a row wins; a clean no-op for the rest). Returns
 * whether THIS call was the one that changed it, so the caller knows
 * whether to do its own once-only cleanup (deleting the raw R2 upload).
 */
export async function markDoneIfProcessing(db, id) {
  const result = await db
    .prepare(`UPDATE deck_import_jobs SET status = 'done', updated_at = ? WHERE id = ? AND status = 'processing'`)
    .bind(Date.now(), id)
    .run()
  return result.meta.changes > 0
}
