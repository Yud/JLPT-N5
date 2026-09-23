// Standalone Worker hosting the DeckImportWorkflow and MediaChunkWorkflow
// (see repo root wrangler.toml's [[services]] DECK_IMPORT_WORKFLOW_TRIGGER
// binding and functions/api/decks/import/[jobId]/start.js, which triggers
// the former).
//
// Cloudflare Pages Functions can't define a WorkflowEntrypoint directly — it
// has to live in its own Worker, deployed separately (see
// .github/workflows/deploy.yml), which Pages Functions call via a service
// binding. This Worker's only job is: (1) a minimal HTTP entrypoint Pages
// Functions can `.fetch()` to create a DeckImportWorkflow instance, and (2)
// the two Workflow classes themselves.
//
// DeckImportWorkflow does the deck/card side of an Anki import (parse the
// central directory, decode the SQLite collection, upsert decks/cards) and
// SCATTERS the actual media processing — it creates one deck_import_tasks
// row and one independent MediaChunkWorkflow instance per chunk, then its
// own job is done; it never waits for them. See MediaChunkWorkflow's own
// header comment (mediaChunkWorkflow.js) and
// migrations/0008_create_deck_import_tasks.sql for why scatter/gather
// exists at all: a single long-lived instance coordinating every media
// chunk itself, the way this used to work, meant every chunk shared one
// instance's resource budget for an import's whole duration, and that broke
// production repeatedly (a 108MB archive, and separately the sql.js WASM
// module used to parse it, both ended up retained in run()'s own suspended
// state across dozens of later step.do() calls).
//
// Neither this Workflow nor MediaChunkWorkflow ever fetches the archive's
// full bytes at all, let alone holds them across a step boundary — see
// ANKI-IMPORT-RANGE-READ-PLAN.md (repo root) for the full history of why
// that guarantee, not just "scope the fetch carefully," was the actual fix:
// even the scatter/gather split above still had each MediaChunkWorkflow
// instance fetch the full archive itself, and Workers memory is
// per-*isolate*, not per-invocation — several concurrently-scheduled
// instances (createBatch() creates all of them at nearly the same moment)
// could share one isolate's 128MB budget. `readCentralDirectory` (this
// file's scatter phase, via extractDeckMetadata) and `readZipEntryData`
// (MediaChunkWorkflow, via decompressMediaFile(s)) — both in
// shared/data/zipRangeReader.js — range-read only the specific bytes each
// needs from R2 (workflows/anki-import/src/r2ZipReader.js), so this holds
// even when many instances share an isolate. This also means the R2-staging
// tier an earlier version of this file had (packMediaChunk/
// extractRawMediaFiles, commit 9f8d68c) is gone entirely — it existed only
// to work around MediaChunkWorkflow needing the full archive, which range
// reads make unnecessary.
//
// Earlier designs had the browser parse the .apkg client-side and drive a
// multi-request choreography (deck/card POST, N media-upload POSTs, a
// trigger POST) to a version of this Worker that only handled media; that
// crashed production repeatedly too (subrequest cap, CPU-time cap, and a
// version of the CPU-time cap again even after media processing moved
// server-side, because uploading media in size-capped batches still did
// hundreds of sequential R2 puts in one Pages Function invocation). The
// browser now does exactly one thing: PUT the raw .apkg directly to R2 via a
// presigned URL (functions/api/decks/import.js), never touching a Worker for
// the file transfer at all.

import { WorkflowEntrypoint } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { extractDeckMetadata, renderCardChunk } from '../../../shared/data/ankiImport.js'
import { upsertDeckRow, upsertCardChunk } from '../../../shared/server/deckImportProcessing.js'
import { createMediaTasks, mediaTaskId } from '../../../shared/server/deckImportTasks.js'
import * as deckImportJobsRepo from '../../../shared/repos/deckImportJobsRepo.js'
import * as deckImportTasksRepo from '../../../shared/repos/deckImportTasksRepo.js'
import { loadSqlJsForWorkflow } from './loadSqlJs.js'
import { R2ZipReader } from './r2ZipReader.js'

export { MediaChunkWorkflow } from './mediaChunkWorkflow.js'

// This account is on Workers Free: 10ms CPU per step (fixed, cannot be
// raised) and 1,024 steps per Workflow instance (fixed) — both bind at once
// for a deck this size (4,354 media files, 1,501 cards).
//
// RENDER_CHUNK_SIZE (card template rendering, stays inline in
// DeckImportWorkflow — cheap, never the source of a production crash, and
// doesn't touch the archive's raw bytes) is sized off measured
// template-rendering cost (~0.03ms/card locally against
// Kaishi.1.5k.v2.4.3.apkg, repo root — see the profiling notes in the
// commit/PR this shipped from). upsertCardChunk already batches its writes,
// so it was never at risk from D1's per-invocation query-count or
// per-query bound-parameter limits either.
//
// MEDIA_CHUNK_SIZE (files per MediaChunkWorkflow instance) no longer has to
// account for isolate memory at all — range reads mean an instance only
// ever holds one entry's compressed bytes at a time (typically a few KB to
// low hundreds of KB for Anki media), regardless of how many instances
// share an isolate. It's still sized off the remaining real ceilings:
//   - D1 queries per invocation (50 on Free) — processMediaChunk batches a
//     whole chunk's writes into one db.batch() call.
//   - D1 bound parameters per query (100) — processMediaChunk's
//     existence-check SELECT binds one `?` per filename plus one for
//     deckId, so this has to stay comfortably under 100.
//   - CPU time per step (10ms, Free): profiled locally against the real
//     fixture (Kaishi.1.5k.v2.4.3.apkg) — range-reading + decompressing a
//     90-file chunk's zip-layer bytes costs 0.14-1.2ms of actual CPU
//     (sampled first/second/middle/last chunks; I/O wait from the
//     range-read calls themselves doesn't count against this budget). Wide
//     margin under 10ms — 90 was kept rather than raised further since
//     nothing forces a change and D1's limits above are the tighter
//     constraint anyway.
const MEDIA_CHUNK_SIZE = 90
const RENDER_CHUNK_SIZE = 150

// Workflows' createBatch() accepts at most 100 instances per call (same
// figure Cloudflare uses for the underlying instance-creation limit) — this
// bounds how many deck_import_tasks rows + MediaChunkWorkflow instances the
// scatter step creates in one d1.batch()/createBatch() pair, independent of
// MEDIA_CHUNK_SIZE. For this deck (4,354 media files / 90 per chunk = 49
// chunks) one scatter batch covers everything; a much larger deck would
// need more than one, which the loop below already handles.
const SCATTER_BATCH_SIZE = 100

/**
 * Extracts deck metadata via range reads against the raw upload in R2 — kept
 * as its own function, not inlined into run(), so `SQL` (the loaded sql.js
 * WASM module) is scoped to THIS function's call frame and eligible for GC
 * once it returns, rather than staying part of run()'s own suspended state
 * for the rest of a long execution — see the memory-limit history in this
 * file's git log for why that distinction mattered in production. Unlike
 * that history, `reader` never holds more than one small range read's worth
 * of bytes at a time regardless of scope — see ANKI-IMPORT-RANGE-READ-PLAN.md.
 */
async function fetchAndExtractDeckMetadata({ mediaBucket, r2Key, jobId }) {
  const head = await mediaBucket.head(r2Key)
  if (!head) throw new NonRetryableError(`Raw upload missing for job ${jobId}`)
  const reader = new R2ZipReader(mediaBucket, r2Key)
  const SQL = await loadSqlJsForWorkflow()
  return extractDeckMetadata(reader, SQL)
}

export class DeckImportWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, r2Key } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA
    const mediaChunkWorkflow = this.env.MEDIA_CHUNK_WORKFLOW

    try {
      // Plain code, NOT step.do() — a parsed deck's raw card rows (unrendered
      // — see shared/data/ankiImport.js's module header comment for why
      // rendering is deferred to chunked steps below) stay well under
      // Workflows' 1 MiB per-step-result cap regardless of deck size, and
      // step results are memoized by name: on a resumed execution, an
      // already-completed step's callback body does not re-run, it just
      // returns the cached result. This phase is pure, side-effect-free work
      // over the immutable uploaded bytes, so it's safe (and per Cloudflare's
      // own guidance, correct) to run outside a step — a restart just
      // re-parses. See fetchAndExtractDeckMetadata's own doc comment for why
      // it's a separate function rather than inlined here. Also safely under
      // budget on its own: central-directory parsing (readCentralDirectory,
      // shared/data/zipRangeReader.js) measured at 3.08ms against the real
      // fixture's 4,358 entries — see ANKI-IMPORT-RANGE-READ-PLAN.md for why
      // that number, not unzipit's own 21.2ms for the same parse, is what
      // this relies on.
      const { decks, mediaEntryByFilename, notetypeCache } = await fetchAndExtractDeckMetadata({ mediaBucket, r2Key, jobId })

      await step.do('update-deck-total', async () => {
        await deckImportJobsRepo.updateDecksTotal(db, { id: jobId, decksTotal: decks.length })
      })

      for (const deck of decks) {
        // Deck row only — card_count comes from the raw (unrendered) row
        // count, known upfront, so this doesn't need to wait on rendering.
        const { deckId } = await step.do(`upsert-deck-${deck.ankiDeckId}`, async () => upsertDeckRow({ db, deck }))

        // Renders + upserts this deck's cards a chunk at a time. Each chunk
        // step RETURNS its own mediaNeeded (small, bounded by chunk size) —
        // accumulated into the Set below OUTSIDE step.do(): a step that's
        // already complete is skipped (not re-run) on a resumed execution,
        // so anything that must survive a resume has to come from a step's
        // return value, never a side effect written from inside its
        // callback.
        const mediaNeeded = new Set()
        for (let i = 0; i < deck.cardRows.length; i += RENDER_CHUNK_SIZE) {
          const cardRowsChunk = deck.cardRows.slice(i, i + RENDER_CHUNK_SIZE)
          const { mediaNeeded: chunkMediaNeeded } = await step.do(`render-${deck.ankiDeckId}-${i}`, async () => {
            const cards = renderCardChunk(cardRowsChunk, notetypeCache)
            return upsertCardChunk({ db, deckId, cards })
          })
          for (const filename of chunkMediaNeeded) mediaNeeded.add(filename)
        }

        // decks_done means "this deck's row and all its cards are written"
        // — it does NOT wait for this deck's media, which is now scattered
        // to independent instances below and tracked separately (mediaDone/
        // mediaTotal, sourced from deck_import_tasks — see the GET
        // /api/decks/import/:jobId endpoint). The job as a whole isn't
        // 'done' until every media task finishes; see completeMediaTask
        // (shared/server/deckImportTasks.js) for that finalization.
        await step.do(`deck-done-${deck.ankiDeckId}`, async () => {
          await deckImportJobsRepo.incrementDecksDone(db, jobId)
        })

        const mediaNeededList = [...mediaNeeded]
        const chunks = []
        for (let i = 0; i < mediaNeededList.length; i += MEDIA_CHUNK_SIZE) {
          chunks.push({ index: i, filenames: mediaNeededList.slice(i, i + MEDIA_CHUNK_SIZE) })
        }

        // SCATTER: create task rows + MediaChunkWorkflow instances, batched
        // up to createBatch()'s 100-instance-per-call limit (independent of
        // MEDIA_CHUNK_SIZE — for this deck, 49 chunks fit in one batch). No
        // staging step: each instance gets its own files' zip metadata
        // (offset/size/compression method, from mediaEntryByFilename)
        // directly in its payload, and range-reads that data itself from
        // the original r2Key — see mediaChunkWorkflow.js and
        // ANKI-IMPORT-RANGE-READ-PLAN.md. A filename with no
        // mediaEntryByFilename match (referenced by a card but missing from
        // the archive) is passed through with no zip metadata — MediaChunkWorkflow
        // and processMediaChunk already treat that as a `bytes: null` skip,
        // not an error.
        for (let batchStart = 0; batchStart < chunks.length; batchStart += SCATTER_BATCH_SIZE) {
          const batch = chunks.slice(batchStart, batchStart + SCATTER_BATCH_SIZE)
          await step.do(`scatter-media-${deck.ankiDeckId}-${batchStart}`, async () => {
            const taskIds = batch.map((chunk) => mediaTaskId(jobId, deck.ankiDeckId, chunk.index))
            await createMediaTasks({ db, jobId, taskIds })

            const instances = batch.map((chunk, i) => ({
              id: taskIds[i],
              params: {
                jobId,
                r2Key,
                deckId,
                taskId: taskIds[i],
                files: chunk.filenames.map((filename) => {
                  const entry = mediaEntryByFilename.get(filename)
                  return entry
                    ? {
                        filename,
                        compressionMethod: entry.compressionMethod,
                        compressedSize: entry.compressedSize,
                        uncompressedSize: entry.uncompressedSize,
                        relativeOffsetOfLocalHeader: entry.relativeOffsetOfLocalHeader,
                      }
                    : { filename }
                }),
              },
            }))
            await mediaChunkWorkflow.createBatch(instances)
          })
        }
      }

      // Safety net for a deck (or a whole job) with no media references at
      // all: if no deck_import_tasks rows were ever created, no
      // MediaChunkWorkflow instance will ever run completeMediaTask's
      // finalization, and the job would otherwise sit at 'processing'
      // forever. Matches completeMediaTask's own finalization guard
      // (`WHERE status = 'processing'`), so this is a safe no-op if any
      // tasks do exist.
      await step.do('finalize-if-no-media', async () => {
        const { total } = await deckImportTasksRepo.getCounts(db, jobId)
        if (total > 0) return
        const changed = await deckImportJobsRepo.markDoneIfProcessing(db, jobId)
        if (changed) await mediaBucket.delete(r2Key).catch(() => {})
      })
    } catch (err) {
      // Reached only once retries for a step are exhausted — record the
      // failure on the job row rather than leaving it stuck at 'processing'
      // forever. Not rethrown: the row itself is now the durable record of
      // this failure, so there's nothing left for the Workflow's own
      // retry/alerting to usefully do with a second throw. This only covers
      // failures in the scatter phase itself (metadata extraction, deck/card
      // upserts, task creation) — a media chunk failing after being
      // scattered is handled independently by completeMediaTask, since by
      // then this instance is no longer involved.
      await step.do('mark-error', async () => {
        await deckImportJobsRepo.markError(db, { id: jobId, error: String(err?.message ?? err) })
        await mediaBucket.delete(r2Key).catch(() => {})
      })
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body.jobId !== 'string' || typeof body.r2Key !== 'string') {
      return new Response('Body must be { jobId: string, r2Key: string }', { status: 400 })
    }

    await env.DECK_IMPORT_WORKFLOW.create({ id: body.jobId, params: body })
    return new Response(null, { status: 202 })
  },
}
