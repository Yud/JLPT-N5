// POST /api/decks/:deckId/media/upload  (multipart/form-data, one part per
// file, part name = the Anki filename)
// Step 2a of importing an Anki deck: stores each uploaded file at a temp R2
// key. Pure I/O, deliberately dumb — no D1 calls, no existence checks, no
// card rewriting. That work (media_assets upsert, referencing-card rewrite)
// used to happen right here, synchronously, and twice crashed production
// (subrequest cap, then CPU-time cap) once a real deck's media count got
// into the thousands. It now happens in workflows/anki-import's Workflow,
// triggered by .../media/process once every file for a deck has landed
// here — see that file and specs/003-anki-deck-import for the full picture.
//
// Since this is now pure R2 puts, the aggressive per-batch file-count cap
// useDeckImport.js used to need (to stay under the *old* handler's
// per-invocation subrequest budget) is gone — only a byte-size cap remains,
// to stay under Cloudflare's 100MB request body limit.

export async function onRequestPost(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { deckId } = context.params
  const db = context.env.DB
  const deck = await db.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const formData = await context.request.formData()
  const stored = []

  for (const [filename, file] of formData.entries()) {
    if (typeof file === 'string') continue // not a file part
    const bytes = await file.arrayBuffer()
    await context.env.MEDIA.put(`imports/${deckId}/${filename}`, bytes)
    stored.push(filename)
  }

  return Response.json({ stored })
}
