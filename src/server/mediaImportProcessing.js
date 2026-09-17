// Per-file media-processing logic shared by the media-import Workflow
// (workflows/anki-import/src/index.js) and its unit tests
// (functions/test/media-import-processing.test.js). Extracted as a plain,
// framework-free function (mirrors src/scheduling/scheduler.js's split from
// its endpoint) so it's testable without a live Workflow runtime.
//
// This is a straight port of what used to run synchronously in
// functions/api/decks/[deckId]/media.js (removed) — same D1/R2 calls, same
// D1 quirks worked around (instr() over LIKE, id reuse on re-upload) — just
// now called once per file from inside a Workflow step instead of an HTTP
// handler, so a crash/retry doesn't lose the whole batch.

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

export function contentTypeFor(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

export function rewriteReference(text, filename, url) {
  return text
    .replaceAll(`[sound:${filename}]`, `[sound:${url}]`)
    .replaceAll(`src="${filename}"`, `src="${url}"`)
    .replaceAll(`src='${filename}'`, `src='${url}'`)
}

export function tempMediaKey(deckId, filename) {
  return `imports/${deckId}/${filename}`
}

// Thrown for failures a retry can never fix (e.g. the uploaded file is
// simply missing) — the Workflow maps this to a NonRetryableError so it
// doesn't keep re-running the same doomed step.
export class MissingUploadError extends Error {}

/**
 * Moves one already-uploaded file (functions/api/decks/[deckId]/media/
 * upload.js put it at its temp key) to its permanent R2 key, upserts its
 * media_assets row, rewrites any card in the deck that still references the
 * raw filename to point at /api/media/<id>, then deletes the temp object.
 *
 * `db` is a D1Database binding, `mediaBucket` an R2Bucket binding — both
 * shared between the deck's main D1/R2 and this Workflow (same bindings,
 * different Worker).
 */
export async function processMediaFile({ db, mediaBucket, deckId, filename }) {
  const tempKey = tempMediaKey(deckId, filename)
  const tempObject = await mediaBucket.get(tempKey)
  if (!tempObject) {
    throw new MissingUploadError(`No uploaded media found for ${deckId}/${filename}`)
  }

  const bytes = await tempObject.arrayBuffer()
  const contentType = contentTypeFor(filename)

  const existing = await db
    .prepare('SELECT id FROM media_assets WHERE deck_id = ? AND filename = ?')
    .bind(deckId, filename)
    .first()
  const mediaAssetId = existing?.id ?? crypto.randomUUID()

  await mediaBucket.put(mediaAssetId, bytes, { httpMetadata: { contentType } })

  await db
    .prepare(
      `INSERT INTO media_assets (id, deck_id, filename, content_type, size_bytes)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (deck_id, filename) DO UPDATE SET content_type = excluded.content_type, size_bytes = excluded.size_bytes`
    )
    .bind(mediaAssetId, deckId, filename, contentType, bytes.byteLength)
    .run()

  const mediaUrl = `/api/media/${mediaAssetId}`
  // instr(), not LIKE '%...%': D1 rejects long/complex LIKE patterns ("LIKE
  // or GLOB pattern too complex") for the long, content-hash-style
  // filenames real Anki media commonly uses — instr() is a plain substring
  // check, not pattern matching, so it has no such limit.
  const referencingCards = await db
    .prepare('SELECT id, front, back FROM cards WHERE deck_id = ? AND (instr(front, ?) > 0 OR instr(back, ?) > 0)')
    .bind(deckId, filename, filename)
    .all()
  for (const card of referencingCards.results) {
    await db
      .prepare('UPDATE cards SET front = ?, back = ? WHERE id = ?')
      .bind(rewriteReference(card.front, filename, mediaUrl), rewriteReference(card.back, filename, mediaUrl), card.id)
      .run()
  }

  await mediaBucket.delete(tempKey)

  return { filename, mediaAssetId }
}
