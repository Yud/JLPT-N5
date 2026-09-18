// One independent Workflow instance per media chunk — created by
// DeckImportWorkflow's scatter step (index.js), never run inline inside it.
// See migrations/0008_create_deck_import_tasks.sql for why: a single
// long-lived Workflow instance coordinating every chunk itself, the way
// this used to work, meant every chunk shared one instance's resource
// budget for the whole import's duration, and a large archive (or the
// sql.js WASM module used to parse it) held in a `run()`-level variable
// stayed part of that function's suspended state across every later
// step.do() call — several production crashes before that was tracked
// down.
//
// This instance does NOT fetch the 108MB archive itself, even though the
// first version of this design did. That still failed in production (4/49
// instances hit "Worker exceeded memory limit") — and, per Cloudflare's own
// docs, memory is "per-isolate, not per-invocation: a single isolate can
// handle many concurrent requests." createBatch() creates every chunk's
// instance at nearly the same moment, so several can land on the same
// isolate concurrently — if each is independently holding its own 108MB
// archive at once, that blows the shared 128MB budget regardless of any
// individual chunk's own content (confirmed: the 4 failed chunks' actual
// decompressed sizes were unremarkable, statistically indistinguishable
// from chunks that succeeded). DeckImportWorkflow's scatter phase now stages
// each chunk's raw media bytes to R2 ahead of time (extractRawMediaFiles +
// packMediaChunk, src/data/ankiImport.js) — this instance only ever fetches
// its own few-MB blob, which stays safe even under concurrent co-scheduling
// (many instances at a few MB each easily share an isolate; even two at
// 108MB each already doesn't).
//
// No coordination with the parent or with sibling chunks happens through
// the Workflows engine itself (e.g. instance status polling) — completion
// is tracked in D1 instead (deck_import_tasks), which is simpler to reason
// about and is what the GET /api/decks/import/:jobId endpoint already reads
// from. See completeMediaTask (src/server/deckImportTasks.js) for exactly
// how a chunk finishing (successfully or not) updates its own row and, for
// the last chunk to finish, finalizes the whole job (including deleting
// every chunk's staged blob, not just the raw upload).

import { WorkflowEntrypoint } from 'cloudflare:workers'
import { decompressMediaBytes, unpackMediaChunk } from '../../../src/data/ankiImport.js'
import { processMediaChunk } from '../../../src/server/mediaImportProcessing.js'
import { completeMediaTask } from '../../../src/server/deckImportTasks.js'

export class MediaChunkWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, r2Key, deckId, taskId, chunkR2Key } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA

    try {
      await step.do('process-chunk', async () => {
        // Fresh fetch, scoped to this step.do() callback's own frame — a
        // few MB, not the whole archive (see this file's header comment).
        const object = await mediaBucket.get(chunkR2Key)
        if (!object) throw new Error(`Staged media chunk missing: ${chunkR2Key}`)
        const packed = new Uint8Array(await object.arrayBuffer())
        const rawFilesByName = unpackMediaChunk(packed)

        const files = []
        for (const [filename, zipLayerBytes] of rawFilesByName) {
          files.push({ filename, bytes: await decompressMediaBytes(zipLayerBytes) })
        }
        await processMediaChunk({ db, mediaBucket, deckId, files })
      })

      await step.do('complete-task', async () => {
        await completeMediaTask({ db, mediaBucket, jobId, r2Key, taskId })
      })
    } catch (err) {
      // Reached only once retries for 'process-chunk' are exhausted — same
      // convention as DeckImportWorkflow's own catch block: record the
      // failure rather than leaving the task (and the job) stuck 'pending'/
      // 'processing' forever.
      await step.do('fail-task', async () => {
        await completeMediaTask({ db, mediaBucket, jobId, r2Key, taskId, error: err })
      })
    }
  }
}
