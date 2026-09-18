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
// DeckImportWorkflow does the deck/card side of an Anki import (unzip,
// decode the SQLite collection, upsert decks/cards) and SCATTERS media
// processing — it creates one deck_import_tasks row and one independent
// MediaChunkWorkflow instance per chunk of media files, then its own job is
// done; it never waits for them. See MediaChunkWorkflow's own header comment
// (mediaChunkWorkflow.js) and migrations/0008_create_deck_import_tasks.sql
// for why: a single long-lived instance coordinating every media chunk
// itself, the way this used to work, meant every chunk shared one instance's
// resource budget for an import's whole duration, and that broke production
// repeatedly (see this file's git history — a 108MB archive, and separately
// the sql.js WASM module used to parse it, both ended up retained in run()'s
// own suspended state across dozens of later step.do() calls, each a fix
// that only lasted until the next resource ceiling). Each MediaChunkWorkflow
// instance instead gets a genuinely fresh isolate and only ever knows about
// its own chunk.
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
import { extractDeckMetadata, renderCardChunk } from '../../../src/data/ankiImport.js'
import { upsertDeckRow, upsertCardChunk } from '../../../src/server/deckImportProcessing.js'
import { createMediaTasks, mediaTaskId } from '../../../src/server/deckImportTasks.js'
import { loadSqlJsForWorkflow } from './loadSqlJs.js'

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
// MEDIA_CHUNK_SIZE (files per MediaChunkWorkflow instance) is sized off
// three separate, independent ceilings this hit in production, all now
// handled by MediaChunkWorkflow/processMediaChunk — see their own comments
// for the fixes:
//   - CPU time: fflate's per-call cost is dominated by a near-fixed
//     central-directory scan (~3-9ms locally, largely independent of chunk
//     size up to at least 200 files), so this is sized for step count, not
//     CPU headroom, unlike the original (unverified) CHUNK_SIZE=5 guess.
//   - D1 queries per invocation (50 on Free) — processMediaChunk batches a
//     whole chunk's writes into one db.batch() call.
//   - D1 bound parameters per query (100) — processMediaChunk's
//     existence-check SELECT binds one `?` per filename plus one for
//     deckId, so this has to stay comfortably under 100.
// Isolate memory (128MB, fixed on every plan) isn't a per-chunk-size
// constraint at all with the scatter/gather design — each chunk gets its
// own instance and its own budget, rather than sharing one growing budget
// with every other chunk in the import.
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
 * Fetches the raw upload from R2 and extracts deck metadata from it — kept
 * as its own function, not inlined into run(), specifically so its locals
 * (`arrayBuffer`, the whole archive, AND `SQL`, the loaded sql.js WASM
 * module) are scoped to THIS function's call frame and eligible for GC once
 * it returns, rather than staying part of run()'s own suspended state for
 * the rest of a long execution — see the memory-limit history in this
 * file's git log for why that distinction mattered in production (twice:
 * once for `arrayBuffer`, once for `SQL`, loaded here for the same reason).
 */
async function fetchAndExtractDeckMetadata({ mediaBucket, r2Key, jobId }) {
  const object = await mediaBucket.get(r2Key)
  if (!object) throw new NonRetryableError(`Raw upload missing for job ${jobId}`)
  const arrayBuffer = await object.arrayBuffer()
  const SQL = await loadSqlJsForWorkflow()
  return extractDeckMetadata(arrayBuffer, SQL)
}

export class DeckImportWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, r2Key } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA
    const mediaChunkWorkflow = this.env.MEDIA_CHUNK_WORKFLOW

    try {
      // Plain code, NOT step.do() — a parsed deck's raw card rows (unrendered
      // — see src/data/ankiImport.js's module header comment for why
      // rendering is deferred to chunked steps below) stay well under
      // Workflows' 1 MiB per-step-result cap regardless of deck size, and
      // step results are memoized by name: on a resumed execution, an
      // already-completed step's callback body does not re-run, it just
      // returns the cached result. This phase is pure, side-effect-free work
      // over the immutable uploaded bytes, so it's safe (and per Cloudflare's
      // own guidance, correct) to run outside a step — a restart just
      // re-parses. See fetchAndExtractDeckMetadata's own doc comment for why
      // it's a separate function rather than inlined here.
      const { decks, entryNameByFilename, notetypeCache } = await fetchAndExtractDeckMetadata({ mediaBucket, r2Key, jobId })

      await step.do('update-deck-total', async () => {
        await db
          .prepare(`UPDATE deck_import_jobs SET decks_total = ?, updated_at = ? WHERE id = ?`)
          .bind(decks.length, Date.now(), jobId)
          .run()
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
        // (src/server/deckImportTasks.js) for that finalization.
        await step.do(`deck-done-${deck.ankiDeckId}`, async () => {
          await db
            .prepare(`UPDATE deck_import_jobs SET decks_done = decks_done + 1, updated_at = ? WHERE id = ?`)
            .bind(Date.now(), jobId)
            .run()
        })

        const mediaNeededList = [...mediaNeeded]
        const chunks = []
        for (let i = 0; i < mediaNeededList.length; i += MEDIA_CHUNK_SIZE) {
          chunks.push({ index: i, filenames: mediaNeededList.slice(i, i + MEDIA_CHUNK_SIZE) })
        }

        for (let batchStart = 0; batchStart < chunks.length; batchStart += SCATTER_BATCH_SIZE) {
          const batch = chunks.slice(batchStart, batchStart + SCATTER_BATCH_SIZE)
          await step.do(`scatter-media-${deck.ankiDeckId}-${batchStart}`, async () => {
            const taskIds = batch.map((chunk) => mediaTaskId(jobId, deck.ankiDeckId, chunk.index))
            await createMediaTasks({ db, jobId, taskIds })

            const instances = batch.map((chunk, i) => {
              // Only this chunk's slice of the filename -> zip-entry map —
              // small and bounded by MEDIA_CHUNK_SIZE, unlike the full
              // manifest (up to 4,354 entries for this deck), which is never
              // handed to a child at all. Each instance re-derives nothing;
              // it just needs to know where its own files live in the
              // archive it fetches for itself.
              const entryNames = Object.fromEntries(
                chunk.filenames.filter((filename) => entryNameByFilename.has(filename)).map((filename) => [filename, entryNameByFilename.get(filename)])
              )
              return {
                id: taskIds[i],
                params: { jobId, r2Key, deckId, taskId: taskIds[i], filenames: chunk.filenames, entryNames },
              }
            })
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
        const { total } = await db.prepare(`SELECT COUNT(*) AS total FROM deck_import_tasks WHERE job_id = ?`).bind(jobId).first()
        if (total > 0) return
        const result = await db
          .prepare(`UPDATE deck_import_jobs SET status = 'done', updated_at = ? WHERE id = ? AND status = 'processing'`)
          .bind(Date.now(), jobId)
          .run()
        if (result.meta.changes > 0) await mediaBucket.delete(r2Key).catch(() => {})
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
        await db
          .prepare(`UPDATE deck_import_jobs SET status = 'error', error = ?, updated_at = ? WHERE id = ?`)
          .bind(String(err?.message ?? err), Date.now(), jobId)
          .run()
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
