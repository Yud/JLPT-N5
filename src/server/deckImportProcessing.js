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
 *
 * Also (re)populates card_media_refs — see migrations/0009_create_card_media_refs.sql
 * for why: it's the indexed reverse lookup (filename -> card_id) that lets
 * processMediaChunk rewrite card references without scanning every card in
 * the deck. Stale refs for each of this chunk's cards are deleted first
 * (one DELETE per card_id — cheap, primary-key-prefixed, and correctly
 * handles a re-import where a card's template changed and it no longer
 * references some filename it used to), then the current set is inserted
 * fresh. Both go in the SAME batch as the card upserts, so this is still one
 * D1 round-trip for the whole chunk regardless of chunk size.
 */
export async function upsertCardChunk({ db, deckId, cards }) {
  const now = Date.now()
  const writes = []
  const mediaNeeded = new Set()

  for (const card of cards) {
    const id = cardId(deckId, card.ankiNoteId)
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
        .bind(id, deckId, card.ankiNoteId, card.front, card.back, now)
    )

    // Deleted by card_id (indexed as the PK's third column — SQLite can
    // still use a PK/index prefix scan here since deck_id is fixed and
    // known, but card_id alone isn't a leading prefix; this is a small,
    // bounded scan of just this one card's own ref rows, not the deck's
    // cards) — cheap regardless, since one card references at most a
    // handful of files.
    writes.push(db.prepare(`DELETE FROM card_media_refs WHERE deck_id = ? AND card_id = ?`).bind(deckId, id))
    for (const filename of card.mediaFilenames) {
      writes.push(
        db
          .prepare(`INSERT INTO card_media_refs (deck_id, filename, card_id) VALUES (?, ?, ?)`)
          .bind(deckId, filename, id)
      )
    }
  }

  if (writes.length > 0) await db.batch(writes)

  return { mediaNeeded: [...mediaNeeded] }
}
