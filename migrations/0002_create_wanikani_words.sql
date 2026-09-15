-- WaniKani vocabulary cache for the listening quiz (#/listening-quiz).
-- Populated by scripts/sync-wanikani-words.mjs from your own WaniKani
-- account; the script wholesale-replaces this table's contents on each
-- run, so it always reflects the last sync exactly. Not user-scoped (one
-- shared cache, unlike card_review_state) since the word list itself isn't
-- per-visitor data.
CREATE TABLE wanikani_words (
  subject_id INTEGER PRIMARY KEY,
  characters TEXT NOT NULL,
  meanings TEXT NOT NULL, -- JSON array of accepted English meanings
  readings TEXT NOT NULL, -- JSON array of accepted kana readings
  level INTEGER NOT NULL,
  srs_stage INTEGER NOT NULL,
  audio TEXT NOT NULL -- JSON array of {url, voiceActorId}
) STRICT;
