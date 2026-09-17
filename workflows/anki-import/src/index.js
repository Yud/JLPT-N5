// Standalone Worker hosting the media-import Workflow (see repo root
// wrangler.toml's [[services]] MEDIA_IMPORT_WORKFLOW_TRIGGER binding and
// functions/api/decks/[deckId]/media/process.js, which triggers it).
//
// Cloudflare Pages Functions can't define a WorkflowEntrypoint directly —
// it has to live in its own Worker, deployed separately (see
// .github/workflows/deploy.yml), which Pages Functions call via a service
// binding. This Worker's only job is: (1) a minimal HTTP entrypoint Pages
// Functions can `.fetch()` to create a Workflow instance, and (2) the
// Workflow itself.
//
// Why a Workflow at all: functions/api/decks/[deckId]/media.js (removed)
// did this same per-file work synchronously inside one Pages Function
// invocation and twice crashed production — first on Cloudflare's
// subrequest cap, then (after batching fixed that) on the CPU-time cap
// ("Error 1102: Worker exceeded resource limits"), because a few thousand
// files' worth of R2/D1 calls just doesn't fit in one invocation's budget.
// A Workflow's steps each get a fresh CPU budget and durable retry, so
// processing an arbitrarily large deck's media no longer has to fit in one
// request at all.

import { WorkflowEntrypoint } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { MissingUploadError, processMediaFile } from '../../../src/server/mediaImportProcessing.js'

// Small enough that even a Free-plan 10ms CPU budget comfortably covers one
// chunk's D1/R2 calls' JS-side overhead, while still keeping the number of
// Workflow steps (and so D1 writes to media_import_jobs) reasonable for a
// multi-thousand-file deck.
const CHUNK_SIZE = 20

export class MediaImportWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, deckId, filenames } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA

    try {
      let done = 0
      for (let i = 0; i < filenames.length; i += CHUNK_SIZE) {
        const chunk = filenames.slice(i, i + CHUNK_SIZE)

        await step.do(`process-chunk-${i}`, async () => {
          for (const filename of chunk) {
            try {
              await processMediaFile({ db, mediaBucket, deckId, filename })
            } catch (err) {
              // A missing upload can never resolve itself on retry — every
              // other error (a transient D1/R2 hiccup) is left to the
              // Workflow's default retry behavior.
              if (err instanceof MissingUploadError) throw new NonRetryableError(err.message)
              throw err
            }
          }
        })

        done += chunk.length
        await step.do(`update-progress-${i}`, async () => {
          await db
            .prepare(`UPDATE media_import_jobs SET status = 'processing', done = ?, updated_at = ? WHERE id = ?`)
            .bind(done, Date.now(), jobId)
            .run()
        })
      }

      await step.do('mark-done', async () => {
        await db.prepare(`UPDATE media_import_jobs SET status = 'done', updated_at = ? WHERE id = ?`).bind(Date.now(), jobId).run()
      })
    } catch (err) {
      // Reached only once retries for a step are exhausted (or a
      // NonRetryableError was thrown) — record the failure on the job row
      // rather than leaving it stuck at 'processing' forever. Not
      // rethrown: the row itself is now the durable record of this
      // failure, so there's nothing left for the Workflow's own
      // retry/alerting to usefully do with a second throw.
      await step.do('mark-error', async () => {
        await db
          .prepare(`UPDATE media_import_jobs SET status = 'error', error = ?, updated_at = ? WHERE id = ?`)
          .bind(String(err?.message ?? err), Date.now(), jobId)
          .run()
      })
    }
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    const body = await request.json().catch(() => null)
    if (
      !body ||
      typeof body.jobId !== 'string' ||
      typeof body.deckId !== 'string' ||
      !Array.isArray(body.filenames) ||
      !body.filenames.every((f) => typeof f === 'string')
    ) {
      return new Response('Body must be { jobId: string, deckId: string, filenames: string[] }', { status: 400 })
    }

    await env.MEDIA_IMPORT_WORKFLOW.create({ id: body.jobId, params: body })
    return new Response(null, { status: 202 })
  },
}
