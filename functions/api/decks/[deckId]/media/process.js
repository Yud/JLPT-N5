// POST /api/decks/:deckId/media/process  { filenames: string[] }
// Step 2b of importing an Anki deck: every filename in the body has already
// been uploaded to its temp R2 key by .../media/upload.js. This endpoint
// itself does no per-file work (that's the whole point of the redesign —
// see workflows/anki-import/src/index.js's header comment) — it just
// records a media_import_jobs row and hands the list off to the Workflow
// worker via a service binding, then returns immediately so the browser
// isn't holding a request open for however long the actual processing
// takes.

export async function onRequestPost(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { deckId } = context.params
  const db = context.env.DB
  const deck = await db.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const body = await context.request.json().catch(() => null)
  if (!body || !Array.isArray(body.filenames) || !body.filenames.every((f) => typeof f === 'string')) {
    return new Response('Body must be { filenames: string[] }', { status: 400 })
  }

  // Nothing to process (a deck whose media was all already known) — don't
  // bother creating a job or waking the Workflow worker; the client treats
  // a null jobId as already done.
  if (body.filenames.length === 0) return Response.json({ jobId: null })

  const jobId = crypto.randomUUID()
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO media_import_jobs (id, deck_id, status, total, done, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, 0, ?, ?)`
    )
    .bind(jobId, deckId, body.filenames.length, now, now)
    .run()

  const triggerResponse = await context.env.MEDIA_IMPORT_WORKFLOW_TRIGGER.fetch('https://internal/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, deckId, filenames: body.filenames }),
  })
  if (!triggerResponse.ok) {
    await db
      .prepare(`UPDATE media_import_jobs SET status = 'error', error = ?, updated_at = ? WHERE id = ?`)
      .bind(`Failed to start media processing: ${triggerResponse.status}`, Date.now(), jobId)
      .run()
    return new Response('Failed to start media processing', { status: 502 })
  }

  return Response.json({ jobId })
}
