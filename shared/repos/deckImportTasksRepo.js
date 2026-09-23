// All D1 access for the `deck_import_tasks` table (migrations/0008_create_deck_import_tasks.sql).

/** Inserts one 'pending' row per task, in a single D1 batch (one round-trip regardless of count). */
export async function createMany(db, { jobId, taskIds }) {
  const now = Date.now()
  const writes = taskIds.map((taskId) =>
    db.prepare(`INSERT INTO deck_import_tasks (id, job_id, created_at, updated_at) VALUES (?, ?, ?, ?)`).bind(taskId, jobId, now, now)
  )
  if (writes.length > 0) await db.batch(writes)
}

export async function markDone(db, id) {
  await db.prepare(`UPDATE deck_import_tasks SET status = 'done', updated_at = ? WHERE id = ?`).bind(Date.now(), id).run()
}

export async function markError(db, { id, error }) {
  await db.prepare(`UPDATE deck_import_tasks SET status = 'error', error = ?, updated_at = ? WHERE id = ?`).bind(error, Date.now(), id).run()
}

/** `{total, done, errored}` for a job's tasks — callers use whichever columns they need. */
export async function getCounts(db, jobId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status = 'error') AS errored
       FROM deck_import_tasks WHERE job_id = ?`
    )
    .bind(jobId)
    .first()
}
