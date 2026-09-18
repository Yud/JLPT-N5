-- Permanent per-user card exclusion (not Anki's day-scoped "bury" — this
-- never un-suspends itself). No FK on card_id: like card_review_state,
-- card_id is polymorphic (built-in id or imported "imported-<deckId>-<noteId>"
-- id), so cleanup on deck deletion is explicit (see decks/[deckId]/index.js).
CREATE TABLE card_suspensions (
  user_email TEXT NOT NULL,
  card_id TEXT NOT NULL,
  suspended_at INTEGER NOT NULL,
  PRIMARY KEY (user_email, card_id)
) STRICT;

CREATE INDEX idx_card_suspensions_user ON card_suspensions (user_email);
