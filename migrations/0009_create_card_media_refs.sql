-- Reverse index from a media filename back to the card(s) that reference it
-- — replaces an `instr(front, ?) > 0 OR instr(back, ?) > 0` scan over every
-- card in the deck, run once per media file, which D1 counts as a full scan
-- (instr() isn't indexable): for the real Kaishi deck (4,354 media files,
-- 1,501 cards) that scanned ~6.5 MILLION rows in a single import — enough on
-- its own to blow Workers Free's 5-million-rows-read/day D1 quota mid-import
-- and lock the whole app out of D1 until the next UTC day.
--
-- Populated by upsertCardChunk (src/server/deckImportProcessing.js) at the
-- same time cards are written — it already knows each card's mediaFilenames
-- from rendering, so this costs nothing extra to compute, just to persist.
-- Read by processMediaChunk (src/server/mediaImportProcessing.js) as an
-- indexed exact-match lookup (deck_id, filename) -> card_id(s), replacing
-- the instr() scan entirely: a file referenced by 1-2 cards now costs 1-2
-- rows read instead of 1,501.
CREATE TABLE card_media_refs (
  deck_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  card_id TEXT NOT NULL,
  PRIMARY KEY (deck_id, filename, card_id)
) STRICT;
