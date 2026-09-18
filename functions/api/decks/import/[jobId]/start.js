// POST /api/decks/import/:jobId/start
// Step 2 of importing an Anki deck: called by the browser once its direct PUT to
// R2 (using the presigned URL from POST /api/decks/import) has resolved. Confirms
// the object actually landed, marks the job as processing, then hands off to the
// DeckImportWorkflow (workflows/anki-import) via a service binding — mirrors the
// trigger shape the old media/process.js endpoint used.

export async function onRequestPost(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { jobId } = context.params
  const job = await context.env.DB.prepare('SELECT r2_key FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
  if (!job) return new Response(`Unknown job: ${jobId}`, { status: 404 })

  const object = await context.env.MEDIA.head(job.r2_key)
  if (!object) return new Response('Upload not found — retry the upload before starting', { status: 409 })

  await context.env.DB
    .prepare(`UPDATE deck_import_jobs SET status = 'processing', updated_at = ? WHERE id = ?`)
    .bind(Date.now(), jobId)
    .run()

  const triggerResponse = await context.env.DECK_IMPORT_WORKFLOW_TRIGGER.fetch('https://internal/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, r2Key: job.r2_key }),
  })
  if (!triggerResponse.ok) {
    await context.env.DB
      .prepare(`UPDATE deck_import_jobs SET status = 'error', error = ?, updated_at = ? WHERE id = ?`)
      .bind(`Failed to start import: ${triggerResponse.status}`, Date.now(), jobId)
      .run()
    return new Response('Failed to start import', { status: 502 })
  }

  return Response.json({}, { status: 202 })
}
