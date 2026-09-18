// One independent Workflow instance per media chunk — created by
// DeckImportWorkflow's scatter step (index.js), never run inline inside it.
// See migrations/0008_create_deck_import_tasks.sql for why: a single
// long-lived Workflow instance coordinating every chunk itself, the way
// this used to work, meant every chunk shared one instance's resource
// budget for the whole import's duration, and a large archive (or the
// sql.js WASM module used to parse it) held in a `run()`-level variable
// stayed part of that function's suspended state across every later
// step.do() call — several production crashes before that was tracked
// down. Each MediaChunkWorkflow instance gets a genuinely fresh isolate:
// it only ever knows about its own chunk's filenames, fetches its own copy
// of the archive, and finishes — nothing it allocates can affect any other
// chunk's instance.
//
// No coordination with the parent or with sibling chunks happens through
// the Workflows engine itself (e.g. instance status polling) — completion
// is tracked in D1 instead (deck_import_tasks), which is simpler to reason
// about and is what the GET /api/decks/import/:jobId endpoint already reads
// from. See completeMediaTask (src/server/deckImportTasks.js) for exactly
// how a chunk finishing (successfully or not) updates its own row and, for
// the last chunk to finish, finalizes the whole job.

import { WorkflowEntrypoint } from 'cloudflare:workers'
import { decompressMediaFiles } from '../../../src/data/ankiImport.js'
import { processMediaChunk } from '../../../src/server/mediaImportProcessing.js'
import { completeMediaTask } from '../../../src/server/deckImportTasks.js'

export class MediaChunkWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, r2Key, deckId, taskId, filenames, entryNames } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA

    try {
      await step.do('process-chunk', async () => {
        // Fresh fetch, scoped to this step.do() callback's own frame — see
        // the equivalent comment in DeckImportWorkflow's media step (before
        // this became a separate instance) for why that matters: nothing
        // declared here can leak into anything outside this one instance.
        const object = await mediaBucket.get(r2Key)
        const archiveBytes = new Uint8Array(await object.arrayBuffer())
        const entryNameByFilename = new Map(Object.entries(entryNames))

        const decompressed = await decompressMediaFiles(archiveBytes, entryNameByFilename, filenames)
        const files = filenames.map((filename) => ({ filename, bytes: decompressed.get(filename) }))
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
