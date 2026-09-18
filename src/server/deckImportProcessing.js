// Deck/card D1 upsert logic, shared by the DeckImportWorkflow's per-deck step
// (workflows/anki-import/src/index.js) — extracted from the old
// functions/api/decks/import.js so it's callable from a Workflow step instead
// of only an HTTP handler. Front/back text is inserted with its raw Anki media
// references (`[sound:...]`, `src="..."`) still unrewritten — that rewrite
// happens per-file, later, in processMediaFromParsedDeck (mediaImportProcessing.js),
// once each referenced file's permanent media_assets id is known.

function cardId(deckId, ankiNoteId) {
  return `imported-${deckId}-${ankiNoteId}`
}

/**
 * Upserts one parsed deck (matched by anki_deck_id) and all its cards
 * (matched by anki_note_id) in a single D1 batch. Returns `{ deckId,
 * mediaNeeded }` — `mediaNeeded` is every filename referenced by any of this
 * deck's cards, deduplicated (the caller processes each one exactly once,
 * regardless of how many cards share it).
 */
export async function upsertDeckAndCards({ db, deck }) {
  const deckId = String(deck.ankiDeckId)
  const now = Date.now()

  const writes = [
    db
      .prepare(
        `INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (anki_deck_id) DO UPDATE SET
           name = excluded.name,
           card_count = excluded.card_count,
           updated_at = excluded.updated_at`
      )
      .bind(deckId, deck.ankiDeckId, deck.name, deck.cards.length, now, now),
  ]

  const mediaNeeded = new Set()
  for (const card of deck.cards) {
    for (const filename of card.mediaFilenames) mediaNeeded.add(filename)

    writes.push(
      db
        .prepare(
          `INSERT INTO cards (id, deck_id, anki_note_id, front, back, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (deck_id, anki_note_id) DO UPDATE SET
             front = excluded.front,
             back = excluded.back,
             updated_at = excluded.updated_at`
        )
        .bind(cardId(deckId, card.ankiNoteId), deckId, card.ankiNoteId, card.front, card.back, now)
    )
  }

  await db.batch(writes)

  return { deckId, mediaNeeded: [...mediaNeeded] }
}
