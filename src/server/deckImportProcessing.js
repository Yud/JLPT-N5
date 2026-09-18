// Deck/card D1 upsert logic, shared by the DeckImportWorkflow's per-deck and
// per-card-chunk steps (workflows/anki-import/src/index.js) — extracted from
// the old functions/api/decks/import.js so it's callable from a Workflow step
// instead of only an HTTP handler. Front/back text is inserted with its raw
// Anki media references (`[sound:...]`, `src="..."`) still unrewritten —
// that rewrite happens later, per media chunk, in processMediaChunk
// (mediaImportProcessing.js), once each referenced file's permanent
// media_assets id is known.
//
// Split into two functions, not one combined upsert, because card rendering
// itself is now chunked across many Workflow steps (see
// src/data/ankiImport.js's renderCardChunk) — the deck row (and its
// card_count, known upfront from the raw card-row count before any rendering
// happens) can be written once, before any card is rendered, while cards
// trickle in a chunk at a time from separate steps.

function cardId(deckId, ankiNoteId) {
  return `imported-${deckId}-${ankiNoteId}`
}

/** Upserts one parsed deck's row (matched by anki_deck_id), no cards. Returns `{ deckId }`. */
export async function upsertDeckRow({ db, deck }) {
  const deckId = String(deck.ankiDeckId)
  const now = Date.now()

  await db
    .prepare(
      `INSERT INTO decks (id, anki_deck_id, name, card_count, imported_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (anki_deck_id) DO UPDATE SET
         name = excluded.name,
         card_count = excluded.card_count,
         updated_at = excluded.updated_at`
    )
    .bind(deckId, deck.ankiDeckId, deck.name, deck.cardRows.length, now, now)
    .run()

  return { deckId }
}

/**
 * Upserts one chunk of already-rendered cards (matched by anki_note_id) for
 * `deckId` in a single D1 batch. Returns `{ mediaNeeded }` — every filename
 * referenced by any card in this chunk, deduplicated. The caller (the
 * Workflow's render-chunk step) accumulates `mediaNeeded` across chunks
 * itself; see that file for why the accumulation has to happen outside
 * step.do() rather than as a side effect inside it.
 */
export async function upsertCardChunk({ db, deckId, cards }) {
  const now = Date.now()
  const writes = []
  const mediaNeeded = new Set()

  for (const card of cards) {
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

  if (writes.length > 0) await db.batch(writes)

  return { mediaNeeded: [...mediaNeeded] }
}
