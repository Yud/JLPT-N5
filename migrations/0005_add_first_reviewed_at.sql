-- Daily new-card cap needs "was this card's first-ever review today", which
-- last_reviewed_at can't answer once a card has been reviewed more than once
-- (it's overwritten every review). first_reviewed_at is write-once: set only
-- on insert, never touched by the upsert's DO UPDATE SET.
ALTER TABLE card_review_state ADD COLUMN first_reviewed_at INTEGER;
