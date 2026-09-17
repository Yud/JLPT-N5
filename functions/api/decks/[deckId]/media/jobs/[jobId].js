// GET /api/decks/:deckId/media/jobs/:jobId
// Polled by the browser (useDeckImport.js) while a media-import Workflow
// runs, until status is 'done' or 'error'.

export async function onRequestGet(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { deckId, jobId } = context.params
  const job = await context.env.DB
    .prepare('SELECT * FROM media_import_jobs WHERE id = ? AND deck_id = ?')
    .bind(jobId, deckId)
    .first()
  if (!job) return new Response(`Unknown job: ${jobId}`, { status: 404 })

  return Response.json({
    id: job.id,
    deckId: job.deck_id,
    status: job.status,
    total: job.total,
    done: job.done,
    error: job.error,
  })
}
