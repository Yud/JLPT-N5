-- Generic spaced-repetition state, one row per (user, card).
-- card_id is the explicit, permanent `id` assigned to each card in its data
-- file (e.g. src/data/kana.js) — deck membership lives entirely in code
-- (src/data/decks.js), so this table never needs to change shape when a
-- new script/deck is added, and a card can belong to any number of decks.
CREATE TABLE card_review_state (
  user_email TEXT NOT NULL,
  card_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  interval_days REAL NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at INTEGER,
  PRIMARY KEY (user_email, card_id)
) STRICT;

-- Powers "give me this user's due cards" without a table scan.
CREATE INDEX idx_card_review_state_due ON card_review_state (user_email, due_at);
