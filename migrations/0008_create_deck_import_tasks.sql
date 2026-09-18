-- One row per media chunk in a deck import — replaces the previous design
-- where the DeckImportWorkflow itself looped through every media chunk as a
-- step.do() call, coordinating everything from one long-lived run(). That
-- design forced every chunk to share one Workflow instance's resource
-- budget for the whole import's duration, and proved fragile in practice:
-- a 108MB archive (or the sql.js WASM module used to parse it) held in a
-- variable declared in run() stays part of that function's suspended state
-- across every later step.do() call, several of which crashed production
-- before this was found and fixed (see workflows/anki-import/src/index.js's
-- git history for that debugging trail).
--
-- The new design: DeckImportWorkflow only "scatters" — it creates one row
-- here per media chunk, and one independent MediaChunkWorkflow instance to
-- process it. Each child instance gets a genuinely fresh isolate and
-- resource budget (not a JS closure it has to be disciplined about), does
-- its own work, and marks its own row here done/error, then finishes — nothing
-- it allocates can ever affect any other chunk's memory. Completion isn't
-- tracked via Workflows' own instance-status API (which would require the
-- parent to stay alive polling every child); it's tracked here instead,
-- exactly the way a job-queue table would in any other background-job
-- system — the GET /api/decks/import/:jobId endpoint reports mediaDone/
-- mediaTotal as COUNT(*)/SUM(status='done') over this table, and the last
-- chunk to finish flips deck_import_jobs.status to 'done'.
CREATE TABLE deck_import_tasks (
  id TEXT PRIMARY KEY,             -- `${jobId}-media-${chunkIndex}`
  job_id TEXT NOT NULL,            -- deck_import_jobs.id
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'error'
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_deck_import_tasks_job_id ON deck_import_tasks (job_id);
