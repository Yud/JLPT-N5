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
import { extractDeckMetadata, decompressMediaFile } from '../../../src/data/ankiImport.js'
import { upsertDeckAndCards } from '../../../src/server/deckImportProcessing.js'
import { processMediaFromParsedDeck } from '../../../src/server/mediaImportProcessing.js'
import { loadSqlJsForWorkflow } from './loadSqlJs.js'

// This account is on Workers Free: 10ms CPU per step (fixed, cannot be
// raised) and 1,024 steps per Workflow instance (fixed) — both bind at once
// for a deck this size (4,354 media files). Progress updates are folded into
// the same step as chunk processing rather than a separate step, to keep
// step count down. CHUNK_SIZE=5 is a starting estimate from step-count math
// (ceil(4354/5) = 871, comfortably under 1,024) — verify empirically against
// a real large deck locally before relying on it; see the plan this shipped
// from (git history) for the fallback if 5 files' worth of decompression
// doesn't reliably fit in 10ms of actual CPU.
const CHUNK_SIZE = 5

export class DeckImportWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, r2Key } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA

    try {
      // Plain code, NOT step.do() — a parsed deck's card HTML (1,500+ cards)
      // can exceed Workflows' 1 MiB per-step-result cap, and step results
      // are memoized by name: on a resumed execution, an already-completed
      // step's callback body does not re-run, it just returns the cached
      // result. Parsing is pure, side-effect-free work over the immutable
      // uploaded bytes, so it's safe (and per Cloudflare's own guidance,
      // correct) to run outside a step — a restart just re-parses, which is
      // cheap relative to the per-file work that follows.
      const object = await mediaBucket.get(r2Key)
      if (!object) throw new NonRetryableError(`Raw upload missing for job ${jobId}`)
      const rawBytes = await object.arrayBuffer()
      const SQL = await loadSqlJsForWorkflow()
      // `zip`/`entryNameByFilename` are kept alive only in this run()'s
      // closure — never returned from a step — so the chunk steps below can
      // decompress one media file at a time from the still-open archive.
      const { decks, zip, entryNameByFilename } = await extractDeckMetadata(rawBytes, SQL)

      await step.do('update-deck-total', async () => {
        await db
          .prepare(`UPDATE deck_import_jobs SET decks_total = ?, updated_at = ? WHERE id = ?`)
          .bind(decks.length, Date.now(), jobId)
          .run()
      })

      let mediaDoneTotal = 0
      let mediaTotalSoFar = 0
      for (const deck of decks) {
        // Upserts the deck + every card's text — no media bytes involved,
        // so this stays well under the 1 MiB step-result cap regardless of
        // deck size. Only returns `mediaNeeded`, an array of filenames.
        const { deckId, mediaNeeded } = await step.do(`upsert-deck-${deck.ankiDeckId}`, async () =>
          upsertDeckAndCards({ db, deck })
        )

        mediaTotalSoFar += mediaNeeded.length
        await step.do(`update-media-total-${deck.ankiDeckId}`, async () => {
          await db
            .prepare(`UPDATE deck_import_jobs SET media_total = ?, updated_at = ? WHERE id = ?`)
            .bind(mediaTotalSoFar, Date.now(), jobId)
            .run()
        })

        for (let i = 0; i < mediaNeeded.length; i += CHUNK_SIZE) {
          const chunk = mediaNeeded.slice(i, i + CHUNK_SIZE)
          // Incremented OUTSIDE step.do — a plain, deterministic loop-counter
          // update that correctly recomputes on every replay. If this lived
          // inside the step.do callback instead, an already-completed step
          // would return its cached result without re-running the callback
          // on a resumed execution, silently under-counting progress for
          // every chunk that finished before the restart.
          mediaDoneTotal += chunk.length
          await step.do(`media-${deck.ankiDeckId}-${i}`, async () => {
            for (const filename of chunk) {
              // Decompresses THIS ONE file from the still-open zip, writes
              // it to R2, discards the bytes — never accumulates more than
              // one chunk's worth in memory at a time.
              const bytes = await decompressMediaFile(zip, entryNameByFilename, filename)
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
