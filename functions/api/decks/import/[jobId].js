// GET /api/decks/import/:jobId
// Polled by the browser (useDeckImport.js) while the DeckImportWorkflow runs,
// until status is 'done' or 'error'.

export async function onRequestGet(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { jobId } = context.params
  const job = await context.env.DB.prepare('SELECT * FROM deck_import_jobs WHERE id = ?').bind(jobId).first()
  if (!job) return new Response(`Unknown job: ${jobId}`, { status: 404 })

  return Response.json({
    id: job.id,
    status: job.status,
    decksTotal: job.decks_total,
    decksDone: job.decks_done,
    mediaTotal: job.media_total,
    mediaDone: job.media_done,
    error: job.error,
  })
}
