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
// This instance never fetches the archive at all, let alone the whole
// thing — it range-reads (via R2ZipReader) only its own chunk's files,
// using the zip metadata (offset/size/compression method) DeckImportWorkflow
// already resolved and passed directly in this instance's payload
// (event.payload.files). That's a structural fix, not just a smaller
// fetch: memory is per-*isolate*, not per-invocation (Workers platform
// limits docs — "a single isolate can handle many concurrent requests"),
// and createBatch() creates every chunk's instance at nearly the same
// moment, so several land on the same isolate concurrently regardless of
// how small any one instance's own footprint is. An earlier version of
// this design had each instance fetch a pre-staged, pre-packed blob from R2
// instead of the original archive (commit 9f8d68c) — safer than fetching
// the full archive, but still an unnecessary intermediate copy once range
// reads make the original archive itself cheap to read from directly. See
// ANKI-IMPORT-RANGE-READ-PLAN.md (repo root) for the full history.
//
// No coordination with the parent or with sibling chunks happens through
// the Workflows engine itself (e.g. instance status polling) — completion
// is tracked in D1 instead (deck_import_tasks), which is simpler to reason
// about and is what the GET /api/decks/import/:jobId endpoint already reads
// from. See completeMediaTask (src/server/deckImportTasks.js) for exactly
// how a chunk finishing (successfully or not) updates its own row and, for
// the last chunk to finish, finalizes the whole job (deleting the raw
// upload).

import { WorkflowEntrypoint } from 'cloudflare:workers'
import { decompressMediaFiles } from '../../../src/data/ankiImport.js'
import { processMediaChunk } from '../../../src/server/mediaImportProcessing.js'
import { completeMediaTask } from '../../../src/server/deckImportTasks.js'
import { R2ZipReader } from './r2ZipReader.js'

export class MediaChunkWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { jobId, r2Key, deckId, taskId, files } = event.payload
    const db = this.env.DB
    const mediaBucket = this.env.MEDIA

    try {
      await step.do('process-chunk', async () => {
        // Fresh reader, scoped to this step.do() callback's own frame —
        // each read() only ever pulls one entry's own compressed bytes, not
        // the archive (see this file's header comment).
        const reader = new R2ZipReader(mediaBucket, r2Key)
        const mediaEntryByFilename = new Map(
          files.filter((f) => f.relativeOffsetOfLocalHeader !== undefined).map((f) => [f.filename, f])
        )
        const filenames = files.map((f) => f.filename)
        const decompressed = await decompressMediaFiles(reader, mediaEntryByFilename, filenames)
        const chunkFiles = filenames.map((filename) => ({ filename, bytes: decompressed.get(filename) }))
        await processMediaChunk({ db, mediaBucket, deckId, files: chunkFiles })
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
