// D1 task-tracking for deck-import media chunks — see migrations/
// 0008_create_deck_import_tasks.sql for why this table exists: completion
// tracking for the scatter/gather media-processing design (DeckImportWorkflow
// creates one row here plus one independent MediaChunkWorkflow instance per
// media chunk; each child marks its own row done/error on its way out,
// rather than the parent Workflow polling every child's own Workflow-native
// status, which would mean the parent staying alive coordinating for the
// whole import).

export function mediaTaskId(jobId, deckAnkiId, chunkIndex) {
  return `${jobId}-media-${deckAnkiId}-${chunkIndex}`
}

/** R2 key for one chunk's staged raw-media blob (see extractRawMediaFiles/packMediaChunk, src/data/ankiImport.js) — grouped under a job-scoped prefix so finalization can clean them all up with one list+delete. */
export function stagedMediaChunkKey(jobId, deckAnkiId, chunkIndex) {
  return `raw-imports/${jobId}/media-chunk-${deckAnkiId}-${chunkIndex}.bin`
}

/** Inserts one 'pending' row per task, in a single D1 batch (one round-trip regardless of count). */
export async function createMediaTasks({ db, jobId, taskIds }) {
  const now = Date.now()
  const writes = taskIds.map((taskId) =>
    db
      .prepare(`INSERT INTO deck_import_tasks (id, job_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .bind(taskId, jobId, now, now)
  )
  if (writes.length > 0) await db.batch(writes)
}

/**
 * Marks one media-chunk task done or errored, called by MediaChunkWorkflow
 * on its way out (workflows/anki-import/src/mediaChunkWorkflow.js).
 *
 * On error: marks the task, then marks the whole job errored too — matches
 * the previous single-instance design, where any step throwing failed the
 * whole import rather than silently leaving it stuck. Guarded by `status !=
 * 'done' AND status != 'error'` so a second failing sibling can't stomp on
 * whichever error got there first.
 *
 * On success: marks the task done, then checks whether this was the LAST
 * outstanding task for its job — if so, finalizes the job (status -> 'done',
 * raw upload deleted from R2). The finalizing UPDATE is guarded by `WHERE
 * status = 'processing'`, which makes the "am I last" check safe even if two
 * tasks happen to finish at nearly the same instant and both see "all done":
 * only whichever one's UPDATE actually commits first affects any rows (and
 * therefore does the R2 cleanup) — the other's `changes` comes back 0, a
 * clean no-op. No lock needed; this is the same idempotent-guard pattern
 * already used for the previous design's own status transitions.
 */
export async function completeMediaTask({ db, mediaBucket, jobId, r2Key, taskId, error }) {
  const now = Date.now()

  if (error) {
    await db
      .prepare(`UPDATE deck_import_tasks SET status = 'error', error = ?, updated_at = ? WHERE id = ?`)
      .bind(String(error?.message ?? error), now, taskId)
      .run()
    await db
      .prepare(
        `UPDATE deck_import_jobs SET status = 'error', error = ?, updated_at = ?
         WHERE id = ? AND status != 'done' AND status != 'error'`
      )
      .bind(`Media chunk failed: ${String(error?.message ?? error)}`, now, jobId)
      .run()
    return
  }

  await db.prepare(`UPDATE deck_import_tasks SET status = 'done', updated_at = ? WHERE id = ?`).bind(now, taskId).run()

  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status = 'error') AS errored
       FROM deck_import_tasks WHERE job_id = ?`
    )
    .bind(jobId)
    .first()
  if (counts.errored > 0 || counts.total === 0 || counts.done < counts.total) return // not last, or a sibling already failed

  const result = await db
    .prepare(`UPDATE deck_import_jobs SET status = 'done', updated_at = ? WHERE id = ? AND status = 'processing'`)
    .bind(now, jobId)
    .run()
  if (result.meta.changes > 0) {
    await mediaBucket.delete(r2Key).catch(() => {})
    // Every chunk's staged blob (stagedMediaChunkKey) lives under this same
    // job-scoped prefix — list+delete rather than tracking individual keys,
    // since this runs exactly once (guarded by the UPDATE above) regardless
    // of how many chunks the job had.
    const { objects } = await mediaBucket.list({ prefix: `raw-imports/${jobId}/` })
    await Promise.all(objects.map((object) => mediaBucket.delete(object.key).catch(() => {})))
  }
}
