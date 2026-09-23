// GET /api/decks/import/:jobId
// Polled by the browser (useDeckImport.js) while the DeckImportWorkflow (and,
// once it's scattered them, the independent MediaChunkWorkflow instances it
// creates — see workflows/anki-import/src/index.js) runs, until status is
// 'done' or 'error'.
//
// mediaTotal/mediaDone come from deck_import_tasks, not from columns on
// deck_import_jobs — each media chunk is now its own MediaChunkWorkflow
// instance that marks its own task row done/error on the way out (see
// shared/server/deckImportTasks.js), rather than one Workflow instance updating
// a running counter itself. The job row's own status still flips to 'done'
// (by the last task to finish) or 'error' (by the scatter phase, or by any
// task that fails), so that part of the contract is unchanged.

import * as deckImportJobsRepo from '../../../../shared/repos/deckImportJobsRepo.js'
import * as deckImportTasksRepo from '../../../../shared/repos/deckImportTasksRepo.js'

export async function onRequestGet(context) {
  const { jobId } = context.params
  const db = context.env.DB
  const job = await deckImportJobsRepo.getById(db, jobId)
  if (!job) return new Response(`Unknown job: ${jobId}`, { status: 404 })

  const taskCounts = await deckImportTasksRepo.getCounts(db, jobId)

  return Response.json({
    id: job.id,
    status: job.status,
    decksTotal: job.decks_total,
    decksDone: job.decks_done,
    mediaTotal: taskCounts.total ?? 0,
    mediaDone: taskCounts.done ?? 0,
    error: job.error,
  })
}
