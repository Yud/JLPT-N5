-- Replaces media_import_jobs: the whole Anki import pipeline (deck/card metadata,
-- media decompression and storage) now runs as one Workflow per uploaded .apkg
-- file, tracked by this single job table, instead of a separate per-deck media
-- processing job layered on top of a client-driven multi-request choreography.
DROP TABLE media_import_jobs;

CREATE TABLE deck_import_jobs (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,           -- raw .apkg blob in the MEDIA bucket, deleted once terminal
  status TEXT NOT NULL,           -- 'pending' | 'processing' | 'done' | 'error'
  decks_total INTEGER NOT NULL DEFAULT 0,
  decks_done INTEGER NOT NULL DEFAULT 0,
  media_total INTEGER NOT NULL DEFAULT 0,
  media_done INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
