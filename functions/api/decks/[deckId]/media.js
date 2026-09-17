// POST /api/decks/:deckId/media  (multipart/form-data, one part per file,
// part name = the Anki filename)
// Step 2 of importing an Anki deck: stores each uploaded media file in R2,
// upserts its MediaAsset row, and rewrites any card in this deck whose
// front/back references that filename ([sound:...] or <img src="...">) to
// point at /api/media/<mediaAssetId> instead.

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

function contentTypeFor(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

function rewriteReference(text, filename, url) {
  return text
    .replaceAll(`[sound:${filename}]`, `[sound:${url}]`)
    .replaceAll(`src="${filename}"`, `src="${url}"`)
    .replaceAll(`src='${filename}'`, `src='${url}'`)
}

export async function onRequestPost(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { deckId } = context.params
  const db = context.env.DB
  const deck = await db.prepare('SELECT id FROM decks WHERE id = ?').bind(deckId).first()
  if (!deck) return new Response(`Unknown deck: ${deckId}`, { status: 404 })

  const formData = await context.request.formData()
  const stored = []

  // Deliberately sequential, not batched: a card can reference more than one
  // uploaded file (e.g. both audio and an image), and each rewrite must see
  // the previous one's result — batching these would have each rewrite start
  // from the same stale pre-request snapshot and clobber the others.
  for (const [filename, file] of formData.entries()) {
    if (typeof file === 'string') continue // not a file part

    const bytes = await file.arrayBuffer()
    const contentType = contentTypeFor(filename)

    const existing = await db
      .prepare('SELECT id FROM media_assets WHERE deck_id = ? AND filename = ?')
      .bind(deckId, filename)
      .first()
    const mediaAssetId = existing?.id ?? crypto.randomUUID()

    await context.env.MEDIA.put(mediaAssetId, bytes, { httpMetadata: { contentType } })

    await db
      .prepare(
        `INSERT INTO media_assets (id, deck_id, filename, content_type, size_bytes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (deck_id, filename) DO UPDATE SET content_type = excluded.content_type, size_bytes = excluded.size_bytes`
      )
      .bind(mediaAssetId, deckId, filename, contentType, bytes.byteLength)
      .run()

    const mediaUrl = `/api/media/${mediaAssetId}`
    const referencingCards = await db
      .prepare('SELECT id, front, back FROM cards WHERE deck_id = ? AND (front LIKE ? OR back LIKE ?)')
      .bind(deckId, `%${filename}%`, `%${filename}%`)
      .all()
    for (const card of referencingCards.results) {
      await db
        .prepare('UPDATE cards SET front = ?, back = ? WHERE id = ?')
        .bind(rewriteReference(card.front, filename, mediaUrl), rewriteReference(card.back, filename, mediaUrl), card.id)
        .run()
    }

    stored.push(filename)
  }

  return Response.json({ stored })
}
