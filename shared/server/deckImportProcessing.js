// Deck/card upsert logic, shared by the DeckImportWorkflow's per-deck and
// per-card-chunk steps (workflows/anki-import/src/index.js) — extracted from
// the old functions/api/decks/import.js so it's callable from a Workflow step
// instead of only an HTTP handler. Front/back text is inserted with its raw
// Anki media references (`[sound:...]`, `src="..."`) still unrewritten —
// that rewrite happens later, per media chunk, in processMediaChunk
// (mediaImportProcessing.js), once each referenced file's permanent
// media_assets id is known. All actual D1 access lives in ../repos/ —
// decksRepo, cardsRepo, cardMediaRefsRepo — this file is the orchestration
// on top.
//
// Split into two functions, not one combined upsert, because card rendering
// itself is now chunked across many Workflow steps (see
// shared/data/ankiImport.js's renderCardChunk) — the deck row (and its
// card_count, known upfront from the raw card-row count before any rendering
// happens) can be written once, before any card is rendered, while cards
// trickle in a chunk at a time from separate steps.

import * as decksRepo from '../repos/decksRepo.js'
import * as cardsRepo from '../repos/cardsRepo.js'
import * as cardMediaRefsRepo from '../repos/cardMediaRefsRepo.js'

function cardId(deckId, ankiNoteId) {
  return `imported-${deckId}-${ankiNoteId}`
}

/** Upserts one parsed deck's row (matched by anki_deck_id), no cards. Returns `{ deckId }`. */
export async function upsertDeckRow({ db, deck }) {
  const deckId = String(deck.ankiDeckId)
  await decksRepo.upsert(db, { id: deckId, ankiDeckId: deck.ankiDeckId, name: deck.name, cardCount: deck.cardRows.length })
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

    writes.push(cardsRepo.upsertStatement(db, { id, deckId, ankiNoteId: card.ankiNoteId, front: card.front, back: card.back, updatedAt: now }))

    // Stale refs for this card deleted first, then the current set inserted
    // fresh — correctly handles a re-import where a card's template changed
    // and it no longer references some filename it used to.
    writes.push(cardMediaRefsRepo.deleteByCardIdStatement(db, deckId, id))
    for (const filename of card.mediaFilenames) {
      writes.push(cardMediaRefsRepo.insertStatement(db, { deckId, filename, cardId: id }))
    }
  }

  if (writes.length > 0) await db.batch(writes)

  return { mediaNeeded: [...mediaNeeded] }
}
