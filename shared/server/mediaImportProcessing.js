// Per-chunk media processing, called by MediaChunkWorkflow
// (workflows/anki-import/src/mediaChunkWorkflow.js) once per chunk of
// referenced media files — upserts each file's media_assets row, writes it
// to its permanent R2 key, and rewrites any card that still references the
// raw filename to point at /api/media/<id>. `bytes` come already-decompressed
// from that Workflow's own staged-blob fetch, so there's nothing to fetch or
// clean up here. All D1 access lives in ../repos/ (mediaAssetsRepo,
// cardMediaRefsRepo, cardsRepo) — this file is the R2 + orchestration layer
// on top.
//
// All of a chunk's D1 writes go through ONE db.batch() call, not one
// round-trip per file — D1 caps a Worker invocation (each Workflow step is
// one) at 50 queries on Workers Free (see D1's own limits page: "Queries per
// Worker invocation (read subrequest limits): 1000 (Paid) / 50 (Free)"). The
// original per-file design (~4 separate D1 round-trips per file) blew
// straight through that at any chunk size bigger than ~10, throwing "Too
// many API requests by single Worker invocation" — this batches it down to a
// handful of round-trips total regardless of chunk size.
//
// Card-reference rewriting targets specific card ids from card_media_refs
// (an indexed reverse lookup populated at card-write time — see migrations/
// 0009_create_card_media_refs.sql), not a `WHERE deck_id = ? AND
// (instr(front,?)>0 OR instr(back,?)>0)` scan of every card in the deck. That
// scan was the design from this file's very first version (and survived
// unnoticed through the D1-query-count fix above, since query COUNT and rows
// READ are different metrics) — for the real Kaishi deck it read ~6.5
// million rows in a single import (1,501 cards x 4,354 files), enough alone
// to blow Workers Free's 5-million-rows-read/day D1 quota and lock the whole
// app out of D1 until the next UTC day. REPLACE() still does the actual
// find-and-replace against `front`/`back` in one statement per matched card
// — that part was always fine, it's the WHERE clause that changed. db.batch()
// runs its statements sequentially, each seeing prior statements' effects,
// which matters here: a card referencing two of this chunk's files gets both
// rewrites correctly layered instead of one clobbering the other.

import * as mediaAssetsRepo from '../repos/mediaAssetsRepo.js'
import * as cardMediaRefsRepo from '../repos/cardMediaRefsRepo.js'
import * as cardsRepo from '../repos/cardsRepo.js'

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
  const existingByFilename = await mediaAssetsRepo.findExistingByFilenames(db, deckId, filenames)
  const cardIdsByFilename = await cardMediaRefsRepo.listCardIdsByFilenames(db, deckId, filenames)

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

    writes.push(mediaAssetsRepo.upsertStatement(db, { id: mediaAssetId, deckId, filename, contentType, sizeBytes: bytes.byteLength }))

    if (existing && existing.id !== mediaAssetId) staleAssetIdsToDelete.push(existing.id)

    const mediaUrl = `/api/media/${mediaAssetId}`
    // Targets the specific card(s) that reference this file by id (from
    // card_media_refs — an indexed exact-match lookup, not a scan) rather
    // than searching for them with instr() against every card in the deck —
    // see cardMediaRefsRepo's comment for why that scan was the actual cause
    // of a D1 daily-quota outage.
    const referencingCardIds = cardIdsByFilename.get(filename) ?? []
    for (const referencingCardId of referencingCardIds) {
      writes.push(cardsRepo.rewriteMediaReferenceStatement(db, { cardId: referencingCardId, filename, mediaUrl }))
    }

    results.push({ filename, mediaAssetId })
  }

  // One round-trip for the whole chunk's writes — see module header comment.
  if (writes.length > 0) await db.batch(writes)

  for (const staleId of staleAssetIdsToDelete) {
    await mediaBucket.delete(staleId) // superseded by a fresh id above — otherwise an orphaned, unreferenced object
  }

  return results
}
