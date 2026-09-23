// POST /api/decks/import/:jobId/start
// Step 2 of importing an Anki deck: called by the browser once its direct PUT to
// R2 (using the presigned URL from POST /api/decks/import) has resolved. Confirms
// the object actually landed, marks the job as processing, then hands off to the
// DeckImportWorkflow (workflows/anki-import) via a service binding — mirrors the
// trigger shape the old media/process.js endpoint used.

import * as deckImportJobsRepo from '../../../../../shared/repos/deckImportJobsRepo.js'

export async function onRequestPost(context) {
  const { jobId } = context.params
  const db = context.env.DB
  const job = await deckImportJobsRepo.getById(db, jobId)
  if (!job) return new Response(`Unknown job: ${jobId}`, { status: 404 })

  const object = await context.env.MEDIA.head(job.r2_key)
  if (!object) return new Response('Upload not found — retry the upload before starting', { status: 409 })

  await deckImportJobsRepo.markProcessing(db, jobId)

  const triggerResponse = await context.env.DECK_IMPORT_WORKFLOW_TRIGGER.fetch('https://internal/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, r2Key: job.r2_key }),
  })
  if (!triggerResponse.ok) {
    await deckImportJobsRepo.markError(db, { id: jobId, error: `Failed to start import: ${triggerResponse.status}` })
    return new Response('Failed to start import', { status: 502 })
  }

  return Response.json({}, { status: 202 })
}
