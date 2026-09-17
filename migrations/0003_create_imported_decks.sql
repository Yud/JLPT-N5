-- Decks/cards/media imported from Anki .apkg files (specs/003-anki-deck-import).
-- Built-in decks (hiragana, katakana, vocabulary) stay defined in code
-- (src/data/decks.js) and never get a row here — a deck/card id simply
-- either lives in this table or in that code registry, never both, which is
-- how DELETE /api/decks/:deckId can 404 on a built-in id "for free" (FR-010).

-- One row per Anki sub-deck (a single .apkg can contain several, FR-011).
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  anki_deck_id INTEGER NOT NULL UNIQUE, -- Anki's own decks.id; re-import identity (FR-012)
  name TEXT NOT NULL,
  card_count INTEGER NOT NULL DEFAULT 0,
  imported_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  anki_note_id INTEGER NOT NULL, -- Anki's own notes.id; re-import identity (FR-012)
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (deck_id, anki_note_id)
) STRICT;

-- Powers "does this card belong to a known imported deck" lookups from the
-- reviews endpoints (functions/api/reviews/[cardId].js, due.js).
CREATE INDEX idx_cards_deck ON cards (deck_id);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY, -- also the R2 object key and the GET /api/media/:id path segment
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  filename TEXT NOT NULL, -- original Anki filename; only used to resolve [sound:...]/<img> refs at import time
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  UNIQUE (deck_id, filename)
) STRICT;

CREATE INDEX idx_media_assets_deck ON media_assets (deck_id);
