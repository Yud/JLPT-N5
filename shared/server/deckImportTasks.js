// Deck-import media-chunk task tracking — see migrations/
// 0008_create_deck_import_tasks.sql for why this table exists: completion
// tracking for the scatter/gather media-processing design (DeckImportWorkflow
// creates one row here plus one independent MediaChunkWorkflow instance per
// media chunk; each child marks its own row done/error on its way out,
// rather than the parent Workflow polling every child's own Workflow-native
// status, which would mean the parent staying alive coordinating for the
// whole import). All D1 access lives in ../repos/deckImportTasksRepo.js and
// ../repos/deckImportJobsRepo.js — this file is the orchestration on top.

import * as deckImportJobsRepo from '../repos/deckImportJobsRepo.js'
import * as deckImportTasksRepo from '../repos/deckImportTasksRepo.js'

export function mediaTaskId(jobId, deckAnkiId, chunkIndex) {
  return `${jobId}-media-${deckAnkiId}-${chunkIndex}`
}

export async function createMediaTasks({ db, jobId, taskIds }) {
  await deckImportTasksRepo.createMany(db, { jobId, taskIds })
}

/**
 * Marks one media-chunk task done or errored, called by MediaChunkWorkflow
 * on its way out (workflows/anki-import/src/mediaChunkWorkflow.js).
 *
 * On error: marks the task, then marks the whole job errored too — matches
 * the previous single-instance design, where any step throwing failed the
 * whole import rather than silently leaving it stuck. Uses
 * markErrorIfNotFinished so a second failing sibling can't stomp on
 * whichever error got there first.
 *
 * On success: marks the task done, then checks whether this was the LAST
 * outstanding task for its job — if so, finalizes the job via
 * markDoneIfProcessing (safe under concurrent finishers — see that
 * function's own doc comment) and, only if this call was the one that
 * actually finalized it, cleans up the raw upload from R2.
 */
export async function completeMediaTask({ db, mediaBucket, jobId, r2Key, taskId, error }) {
  if (error) {
    await deckImportTasksRepo.markError(db, { id: taskId, error: String(error?.message ?? error) })
    await deckImportJobsRepo.markErrorIfNotFinished(db, { id: jobId, error: `Media chunk failed: ${String(error?.message ?? error)}` })
    return
  }

  await deckImportTasksRepo.markDone(db, taskId)

  const counts = await deckImportTasksRepo.getCounts(db, jobId)
  if (counts.errored > 0 || counts.total === 0 || counts.done < counts.total) return // not last, or a sibling already failed

  const changed = await deckImportJobsRepo.markDoneIfProcessing(db, jobId)
  if (changed) {
    await mediaBucket.delete(r2Key).catch(() => {})
  }
}
