-- Tracks the background Workflow that processes an imported deck's media
-- (specs/003-anki-deck-import media path moved off the synchronous request
-- cycle after two production CPU/subrequest-limit crashes — see
-- workflows/anki-import). One row per POST .../media/process call; the
-- Workflow updates `done`/`status` as it works through `filenames` in
-- chunks, and the client polls this row until status is done|error.

CREATE TABLE media_import_jobs (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | done | error
  total INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_media_import_jobs_deck ON media_import_jobs (deck_id);
