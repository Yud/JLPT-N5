// GET /api/decks/import/:jobId
// Polled by the browser (useDeckImport.js) while the DeckImportWorkflow (and,
// once it's scattered them, the independent MediaChunkWorkflow instances it
// creates — see workflows/anki-import/src/index.js) runs, until status is
// 'done' or 'error'.
//
// mediaTotal/mediaDone come from deck_import_tasks, not from columns on
// deck_import_jobs — each media chunk is now its own MediaChunkWorkflow
// instance that marks its own task row done/error on the way out (see
// src/server/deckImportTasks.js), rather than one Workflow instance updating
// a running counter itself. The job row's own status still flips to 'done'
// (by the last task to finish) or 'error' (by the scatter phase, or by any
// task that fails), so that part of the contract is unchanged.

export async function onRequestGet(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { jobId } = context.params
  const job = await context.env.DB.prepare('SELECT * FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
  if (!job) return new Response(`Unknown job: ${jobId}`, { status: 404 })

  const taskCounts = await context.env.DB
    .prepare(`SELECT COUNT(*) AS total, SUM(status = 'done') AS done FROM deck_import_tasks WHERE job_id = ?`)
    .bind(jobId)
    .first()

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
