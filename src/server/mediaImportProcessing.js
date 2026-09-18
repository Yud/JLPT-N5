// Per-file media processing, called by the DeckImportWorkflow's chunk steps
// (workflows/anki-import/src/index.js) once per referenced media file —
// upserts its media_assets row, writes it to its permanent R2 key, and
// rewrites any card in the deck that still references the raw filename to
// point at /api/media/<id>.
//
// Unlike the previous design (functions/api/decks/[deckId]/media/upload.js +
// this file's old processMediaFile), there's no temp-key R2 staging step —
// `bytes` come directly from the Workflow's in-memory parsed zip
// (src/data/ankiImport.js's decompressMediaFile, called immediately before
// this), so there's nothing to fetch or clean up here.

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

/**
 * `db` is a D1Database binding, `mediaBucket` an R2Bucket binding. `bytes` is
 * this file's already-decompressed content, or `null` if the card referenced
 * a filename the archive doesn't actually contain — matches the old
 * client-side behavior of surfacing a missing file as a silent skip, not a
 * hard failure (a genuinely malformed reference isn't something a retry can
 * fix, and one bad reference shouldn't abort an otherwise-good import).
 */
export async function processMediaFromParsedDeck({ db, mediaBucket, deckId, filename, bytes }) {
  if (bytes === null) return { filename, skipped: true }

  const existing = await db
    .prepare('SELECT id, size_bytes FROM media_assets WHERE deck_id = ? AND filename = ?')
    .bind(deckId, filename)
    .first()

  const contentType = contentTypeFor(filename)
  // Reusing the existing id is only correct when the content actually
  // hasn't changed — GET /api/media/:id serves it with an "immutable" cache
  // header, promising a given id's bytes never change. Reuse it for a
  // same-content re-run (e.g. a step retry re-decompressing the same file,
  // or a harmless re-import of an unchanged deck); mint a fresh id whenever
  // the size differs from what's on record, so a real content change gets a
  // new URL instead of silently rewriting one browsers may already have
  // cached.
  const contentUnchanged = existing?.size_bytes === bytes.byteLength
  const mediaAssetId = contentUnchanged ? existing.id : crypto.randomUUID()

  await mediaBucket.put(mediaAssetId, bytes, { httpMetadata: { contentType } })

  await db
    .prepare(
      `INSERT INTO media_assets (id, deck_id, filename, content_type, size_bytes)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (deck_id, filename) DO UPDATE SET id = excluded.id, content_type = excluded.content_type, size_bytes = excluded.size_bytes`
    )
    .bind(mediaAssetId, deckId, filename, contentType, bytes.byteLength)
    .run()

  if (existing && existing.id !== mediaAssetId) {
    await mediaBucket.delete(existing.id) // superseded by the fresh id above — otherwise an orphaned, unreferenced object
  }

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

  return { filename, mediaAssetId }
}
