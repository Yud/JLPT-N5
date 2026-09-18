// Standalone Worker hosting the DeckImportWorkflow (see repo root
// wrangler.toml's [[services]] DECK_IMPORT_WORKFLOW_TRIGGER binding and
// functions/api/decks/import/[jobId]/start.js, which triggers it).
//
// Cloudflare Pages Functions can't define a WorkflowEntrypoint directly — it
// has to live in its own Worker, deployed separately (see
// .github/workflows/deploy.yml), which Pages Functions call via a service
// binding. This Worker's only job is: (1) a minimal HTTP entrypoint Pages
// Functions can `.fetch()` to create a Workflow instance, and (2) the
// Workflow itself.
//
// This Workflow does the ENTIRE Anki import — unzip, decode the SQLite
// collection, decompress media, upsert decks/cards, store media — server-side.
// Earlier designs had the browser parse the .apkg client-side and drive a
// multi-request choreography (deck/card POST, N media-upload POSTs, a
// trigger POST) to a version of this Worker that only handled media; that
// crashed production repeatedly (subrequest cap, CPU-time cap, and finally a
// version of the CPU-time cap again even after media processing moved
// server-side, because uploading media in size-capped batches still did
// hundreds of sequential R2 puts in one Pages Function invocation). The
// browser now does exactly one thing: PUT the raw .apkg directly to R2 via a
// presigned URL (functions/api/decks/import.js), never touching a Worker for
// the file transfer at all.

import { WorkflowEntrypoint } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { extractDeckMetadata, renderCardChunk, decompressMediaFiles } from '../../../src/data/ankiImport.js'
import { upsertDeckRow, upsertCardChunk } from '../../../src/server/deckImportProcessing.js'
import { processMediaChunk } from '../../../src/server/mediaImportProcessing.js'
import { loadSqlJsForWorkflow } from './loadSqlJs.js'

// This account is on Workers Free: 10ms CPU per step (fixed, cannot be
// raised) and 1,024 steps per Workflow instance (fixed) — both bind at once
// for a deck this size (4,354 media files, 1,501 cards). Progress updates are
// folded into the same step as chunk processing rather than a separate step,
// to keep step count down.
//
// Both constants below were sized against real timing from the actual deck
// that broke production (Kaishi.1.5k.v2.4.3.apkg, repo root) — see the
// profiling notes in the commit/PR this shipped from. fflate's per-call cost
// for decompressing a media chunk is dominated by a near-fixed central-
// directory scan (~3-9ms locally, largely independent of chunk size up to at
// least 200 files), so MEDIA_CHUNK_SIZE is set high to keep step count well
// under the 1,024 budget rather than tuned down for CPU headroom the way the
// original (unverified) CHUNK_SIZE=5 guess was. RENDER_CHUNK_SIZE is sized
// off measured template-rendering cost (~0.03ms/card locally).
//
// MEDIA_CHUNK_SIZE isn't bound by CPU alone, though: D1 separately caps a
// Worker invocation (each step is one) at 50 queries on Workers Free
// ("Queries per Worker invocation (read subrequest limits): 1000 (Paid) / 50
// (Free)", per D1's own limits page) — hit as "Too many API requests by
// single Worker invocation" when processMediaChunk still wrote one file at a
// time. mediaImportProcessing.js now batches a whole chunk's D1 writes into
// one db.batch() call (2 round-trips total per step, regardless of chunk
// size), so MEDIA_CHUNK_SIZE is no longer constrained by D1's query COUNT —
// only by CPU time, the 1 MiB step-result cap, and one more D1 limit: "Maximum
// bound parameters per query: 100" (same limits page). processMediaChunk's
// existence-check SELECT binds one `?` per filename in the chunk plus one for
// deckId, so MEDIA_CHUNK_SIZE has to stay comfortably under 100 or that one
// query alone fails with "D1_ERROR: too many SQL variables" — hit in
// production at MEDIA_CHUNK_SIZE=100 (100 filenames + 1 deckId = 101).
// RENDER_CHUNK_SIZE was never at risk from either D1 limit: upsertCardChunk's
// batch has no single query whose bound-parameter count scales with the
// whole chunk — each INSERT only binds that one card's own values.
//
// One more limit, separate from all of the above and NOT raised by
// upgrading to Workers Paid: memory is a fixed 128 MB per isolate on every
// plan ("Memory per isolate: 128 MB", Workers platform limits page — the
// table lists 128 MB under both Free and Paid, unlike CPU time's 10ms vs
// 30s+configurable). This deck's raw upload is 108MB — holding it in a
// variable that `run()` itself keeps across the whole multi-step execution
// leaves almost no headroom, and got hit for real: "exceeded CPU or memory
// limits outside of a step" recurred, several media chunks into a real
// import, well after the CPU-time fix above. It wasn't a CPU regression —
// an async function's local variables stay part of its suspended state
// across every `await` for as long as the function hasn't returned, so a
// 108MB `rawBytes` declared in run() itself would still be retained through
// dozens of later `step.do()` calls even though nothing read it again after
// the first one. Fixed by never letting run() hold the archive's bytes at
// all: fetchAndExtractDeckMetadata and each media chunk step below fetch
// their own fresh copy from R2, scoped to their own function/callback frame,
// so it's eligible for GC again as soon as that frame returns — see each
// site's own comment.
//
// Re-verify against Cloudflare Workers Observability after deploying, not
// just local timing — local dev doesn't enforce real CPU-time accounting,
// D1's subrequest caps, or the 128MB memory ceiling the same way production
// does, which is why the CPU-time issue, the D1 batching issue, and this
// memory issue each passed local end-to-end testing but still failed in
// production in turn.
const MEDIA_CHUNK_SIZE = 90
const RENDER_CHUNK_SIZE = 150

/**
 * Fetches the raw upload from R2 and extracts deck metadata from it — kept
 * as its own function, not inlined into run(), specifically so its local
 * `arrayBuffer` (the whole archive) is scoped to THIS function's call frame.
 * Once this returns, that frame — and the 100MB+ it was holding — becomes
 * eligible for GC, instead of staying retained as part of run()'s own
 * suspended state for the rest of a long, many-step execution (see the
 * memory-limit comment above `MEDIA_CHUNK_SIZE`).
 */
async function fetchAndExtractDeckMetadata({ mediaBucket, r2Key, jobId, SQL }) {
  const object = await mediaBucket.get(r2Key)
  if (!object) throw new NonRetryableError(`Raw upload missing for job ${jobId}`)
  const arrayBuffer = await object.arrayBuffer()
  return extractDeckMetadata(arrayBuffer, SQL)
}

export class DeckImportWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, r2Key } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA

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
      // re-parses. It's now cheap enough to actually be cheap: fflate never
      // indexes more of the archive than the couple of entries (collection
      // DB, media manifest) it's asked for here, unlike the JSZip-based
      // version this replaced, which built a full ~4,358-entry index up
      // front and was the dominant cost that made this phase fail outside a
      // step for a deck this size. See fetchAndExtractDeckMetadata's own doc
      // comment for why it's a separate function rather than inlined here.
      const SQL = await loadSqlJsForWorkflow()
      const { decks, entryNameByFilename, notetypeCache } = await fetchAndExtractDeckMetadata({ mediaBucket, r2Key, jobId, SQL })

      await step.do('update-deck-total', async () => {
        await db
          .prepare(`UPDATE deck_import_jobs SET decks_total = ?, updated_at = ? WHERE id = ?`)
          .bind(decks.length, Date.now(), jobId)
          .run()
      })

      let mediaDoneTotal = 0
      let mediaTotalSoFar = 0
      for (const deck of decks) {
        // Deck row only — card_count comes from the raw (unrendered) row
        // count, known upfront, so this doesn't need to wait on rendering.
        const { deckId } = await step.do(`upsert-deck-${deck.ankiDeckId}`, async () => upsertDeckRow({ db, deck }))

        // Renders + upserts this deck's cards a chunk at a time. Each chunk
        // step RETURNS its own mediaNeeded (small, bounded by chunk size) —
        // accumulated into the Set below OUTSIDE step.do(), the same reason
        // mediaDoneTotal is incremented outside step.do() further down: a
        // step that's already complete is skipped (not re-run) on a resumed
        // execution, so anything that must survive a resume has to come from
        // a step's return value, never a side effect written from inside its
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

        mediaTotalSoFar += mediaNeeded.size
        await step.do(`update-media-total-${deck.ankiDeckId}`, async () => {
          await db
            .prepare(`UPDATE deck_import_jobs SET media_total = ?, updated_at = ? WHERE id = ?`)
            .bind(mediaTotalSoFar, Date.now(), jobId)
            .run()
        })

        const mediaNeededList = [...mediaNeeded]
        for (let i = 0; i < mediaNeededList.length; i += MEDIA_CHUNK_SIZE) {
          const chunk = mediaNeededList.slice(i, i + MEDIA_CHUNK_SIZE)
          // Incremented OUTSIDE step.do — a plain, deterministic loop-counter
          // update that correctly recomputes on every replay. If this lived
          // inside the step.do callback instead, an already-completed step
          // would return its cached result without re-running the callback
          // on a resumed execution, silently under-counting progress for
          // every chunk that finished before the restart.
          mediaDoneTotal += chunk.length
          await step.do(`media-${deck.ankiDeckId}-${i}`, async () => {
            // Re-fetches the raw archive from R2 fresh for THIS chunk, rather
            // than reusing one copy held across the whole Workflow run — see
            // the memory-limit comment above MEDIA_CHUNK_SIZE. The refetched
            // bytes are a local of this step.do() callback, so they're
            // eligible for GC as soon as this callback returns, regardless of
            // how many more steps the rest of run() still has to process.
            // Costs an extra R2 read per chunk (~44 of them for this deck);
            // R2 reads are cheap, a 128MB-isolate crash is not.
            const object = await mediaBucket.get(r2Key)
            const archiveBytes = new Uint8Array(await object.arrayBuffer())
            // Decompresses this whole chunk in one pass over that archive —
            // see decompressMediaFiles's doc comment for why that's cheaper
            // than one call per file — then writes each file to R2 and its D1
            // rows in one batch (processMediaChunk — see its module header
            // comment for why that's not done per-file: D1 caps a step at 50
            // queries/invocation on Free, and this chunk size assumes
            // batching, not one-by-one writes), never accumulating more than
            // one chunk's worth of decompressed bytes in memory at a time.
            const decompressed = await decompressMediaFiles(archiveBytes, entryNameByFilename, chunk)
            const files = chunk.map((filename) => ({ filename, bytes: decompressed.get(filename) }))
            await processMediaChunk({ db, mediaBucket, deckId, files })
            await db
              .prepare(`UPDATE deck_import_jobs SET media_done = ?, updated_at = ? WHERE id = ?`)
              .bind(mediaDoneTotal, Date.now(), jobId)
              .run()
          })
        }

        await step.do(`deck-done-${deck.ankiDeckId}`, async () => {
          await db
            .prepare(`UPDATE deck_import_jobs SET decks_done = decks_done + 1, updated_at = ? WHERE id = ?`)
            .bind(Date.now(), jobId)
            .run()
        })
      }

      await step.do('mark-done', async () => {
        await db.prepare(`UPDATE deck_import_jobs SET status = 'done', updated_at = ? WHERE id = ?`).bind(Date.now(), jobId).run()
        await mediaBucket.delete(r2Key)
      })
    } catch (err) {
      // Reached only once retries for a step are exhausted — record the
      // failure on the job row rather than leaving it stuck at 'processing'
      // forever. Not rethrown: the row itself is now the durable record of
      // this failure, so there's nothing left for the Workflow's own
      // retry/alerting to usefully do with a second throw.
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
