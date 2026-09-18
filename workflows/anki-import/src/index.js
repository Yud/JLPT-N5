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
import { processMediaFromParsedDeck } from '../../../src/server/mediaImportProcessing.js'
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
// off measured template-rendering cost (~0.03ms/card locally). Re-verify
// against Cloudflare Workers Observability after deploying, not just local
// timing — local dev doesn't enforce real CPU-time accounting, which is why
// the previous (pre-fflate) design passed local end-to-end testing but still
// failed in production.
const MEDIA_CHUNK_SIZE = 100
const RENDER_CHUNK_SIZE = 150

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
      // step for a deck this size.
      const object = await mediaBucket.get(r2Key)
      if (!object) throw new NonRetryableError(`Raw upload missing for job ${jobId}`)
      const arrayBuffer = await object.arrayBuffer()
      const SQL = await loadSqlJsForWorkflow()
      // `rawBytes`/`entryNameByFilename` are kept alive only in this run()'s
      // closure — never returned from a step — so the chunk steps below can
      // decompress specific media files on demand without re-fetching from
      // R2. `notetypeCache` is likewise closure-only; renderCardChunk (pure)
      // needs it but the SQLite connection it came from is already closed.
      const { decks, rawBytes, entryNameByFilename, notetypeCache } = await extractDeckMetadata(arrayBuffer, SQL)

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
            // Decompresses this whole chunk in one pass over the still-in-
            // memory archive bytes — see decompressMediaFiles's doc comment
            // for why that's cheaper than one call per file — then writes
            // each file to R2 and discards the bytes, never accumulating
            // more than one chunk's worth in memory at a time.
            const decompressed = await decompressMediaFiles(rawBytes, entryNameByFilename, chunk)
            for (const filename of chunk) {
              const bytes = decompressed.get(filename)
              await processMediaFromParsedDeck({ db, mediaBucket, deckId, filename, bytes })
            }
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
