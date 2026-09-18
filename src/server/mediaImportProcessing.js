// Per-chunk media processing, called by the DeckImportWorkflow's chunk steps
// (workflows/anki-import/src/index.js) once per chunk of referenced media
// files — upserts each file's media_assets row, writes it to its permanent
// R2 key, and rewrites any card in the deck that still references the raw
// filename to point at /api/media/<id>.
//
// All of a chunk's D1 writes go through ONE db.batch() call, not one
// round-trip per file — D1 caps a Worker invocation (each Workflow step is
// one) at 50 queries on Workers Free (see D1's own limits page: "Queries per
// Worker invocation (read subrequest limits): 1000 (Paid) / 50 (Free)"). The
// original per-file design (~4 separate D1 round-trips per file: a SELECT
// for the existing asset, an INSERT/UPDATE, a SELECT for referencing cards,
// an UPDATE per referencing card) blew straight through that at any chunk
// size bigger than ~10, throwing "Too many API requests by single Worker
// invocation" — this batches it down to 2 round-trips total (one SELECT, one
// batch) regardless of chunk size.
//
// Card-reference rewriting also moved from "SELECT matching cards, then
// UPDATE each in a JS loop" to a single UPDATE-with-REPLACE() per file
// (still folded into the same batch) — SQLite's REPLACE() does the
// find-and-replace against `front`/`back` for every matching row in one
// statement, so there's no need to read rows back into JS at all. db.batch()
// runs its statements sequentially, each seeing prior statements' effects,
// which matters here: a card referencing two of this chunk's files gets both
// rewrites correctly layered instead of one clobbering the other.
//
// Unlike the previous design (functions/api/decks/[deckId]/media/upload.js +
// this file's old per-file processMediaFile), there's no temp-key R2 staging
// step — `bytes` come directly from the Workflow's on-demand archive reads
// (src/data/ankiImport.js's decompressMediaFiles, called immediately before
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

/**
 * `db` is a D1Database binding, `mediaBucket` an R2Bucket binding. `files` is
 * this chunk's `[{ filename, bytes }]` — `bytes` is that file's
 * already-decompressed content, or `null` if a card referenced a filename
 * the archive doesn't actually contain (matches the old client-side behavior
 * of surfacing a missing file as a silent skip, not a hard failure: a
 * genuinely malformed reference isn't something a retry can fix, and one bad
 * reference shouldn't abort an otherwise-good import). Returns one result
 * per file, in the same order: `{ filename, skipped: true }` or
 * `{ filename, mediaAssetId }`.
 */
export async function processMediaChunk({ db, mediaBucket, deckId, files }) {
  const filenames = files.filter((f) => f.bytes !== null).map((f) => f.filename)

  // Reusing an existing id is only correct when the content actually hasn't
  // changed — GET /api/media/:id serves it with an "immutable" cache header,
  // promising a given id's bytes never change. Reuse it for a same-content
  // re-run (e.g. a step retry re-decompressing the same file, or a harmless
  // re-import of an unchanged deck); mint a fresh id whenever the size
  // differs from what's on record, so a real content change gets a new URL
  // instead of silently rewriting one browsers may already have cached.
  const existingByFilename = new Map()
  if (filenames.length > 0) {
    const placeholders = filenames.map(() => '?').join(', ')
    const { results: existingRows } = await db
      .prepare(`SELECT id, filename, size_bytes FROM media_assets WHERE deck_id = ? AND filename IN (${placeholders})`)
      .bind(deckId, ...filenames)
      .all()
    for (const row of existingRows) existingByFilename.set(row.filename, row)
  }

  const results = []
  const writes = []
  const staleAssetIdsToDelete = []

  for (const { filename, bytes } of files) {
    if (bytes === null) {
      results.push({ filename, skipped: true })
      continue
    }

    const existing = existingByFilename.get(filename)
    const contentType = contentTypeFor(filename)
    const contentUnchanged = existing?.size_bytes === bytes.byteLength
    const mediaAssetId = contentUnchanged ? existing.id : crypto.randomUUID()

    await mediaBucket.put(mediaAssetId, bytes, { httpMetadata: { contentType } })

    writes.push(
      db
        .prepare(
          `INSERT INTO media_assets (id, deck_id, filename, content_type, size_bytes)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (deck_id, filename) DO UPDATE SET id = excluded.id, content_type = excluded.content_type, size_bytes = excluded.size_bytes`
        )
        .bind(mediaAssetId, deckId, filename, contentType, bytes.byteLength)
    )

    if (existing && existing.id !== mediaAssetId) staleAssetIdsToDelete.push(existing.id)

    const mediaUrl = `/api/media/${mediaAssetId}`
    // instr(), not LIKE '%...%': D1 rejects long/complex LIKE patterns ("LIKE
    // or GLOB pattern too complex") for the long, content-hash-style
    // filenames real Anki media commonly uses — instr() is a plain substring
    // check, not pattern matching, so it has no such limit. REPLACE() (also
    // a plain substring operation, not pattern-based) rewrites every
    // occurrence in the matched row in one statement.
    writes.push(
      db
        .prepare(
          `UPDATE cards SET
             front = REPLACE(REPLACE(REPLACE(front, ?, ?), ?, ?), ?, ?),
             back  = REPLACE(REPLACE(REPLACE(back,  ?, ?), ?, ?), ?, ?)
           WHERE deck_id = ? AND (instr(front, ?) > 0 OR instr(back, ?) > 0)`
        )
        .bind(
          `[sound:${filename}]`,
          `[sound:${mediaUrl}]`,
          `src="${filename}"`,
          `src="${mediaUrl}"`,
          `src='${filename}'`,
          `src='${mediaUrl}'`,
          `[sound:${filename}]`,
          `[sound:${mediaUrl}]`,
          `src="${filename}"`,
          `src="${mediaUrl}"`,
          `src='${filename}'`,
          `src='${mediaUrl}'`,
          deckId,
          filename,
          filename
        )
    )

    results.push({ filename, mediaAssetId })
  }

  // One round-trip for the whole chunk's writes — see module header comment.
  if (writes.length > 0) await db.batch(writes)

  for (const staleId of staleAssetIdsToDelete) {
    await mediaBucket.delete(staleId) // superseded by a fresh id above — otherwise an orphaned, unreferenced object
  }

  return results
}
