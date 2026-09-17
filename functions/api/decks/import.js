// POST /api/decks/import  { ankiDeckId, deckName, cards: [{ ankiNoteId, front, back, media }] }
// Step 1 of importing an Anki deck (specs/003-anki-deck-import): the browser
// has already parsed the .apkg client-side (src/data/ankiImport.js) and
// sends extracted card text here — the raw file never reaches the backend.
// Upserts the Deck (matched by anki_deck_id, FR-012) and its Card rows
// (matched by anki_note_id), then reports which referenced media this deck
// doesn't already have stored so the client only uploads what's missing.

function cardId(deckId, ankiNoteId) {
  return `imported-${deckId}-${ankiNoteId}`
}

export async function onRequestPost(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const body = await context.request.json().catch(() => null)
  if (
    !body ||
    typeof body.ankiDeckId !== 'number' ||
    typeof body.deckName !== 'string' ||
    !Array.isArray(body.cards)
  ) {
    return new Response('Body must be { ankiDeckId: number, deckName: string, cards: array }', { status: 400 })
  }

  const deckId = String(body.ankiDeckId)
  const now = Date.now()
  const db = context.env.DB

  const existingMedia = await db
    .prepare('SELECT filename, size_bytes FROM media_assets WHERE deck_id = ?')
    .bind(deckId)
    .all()
  const existingMediaByFilename = new Map(existingMedia.results.map((row) => [row.filename, row.size_bytes]))

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
      .bind(deckId, body.ankiDeckId, body.deckName, body.cards.length, now, now),
  ]

  const mediaNeeded = new Set()
  for (const card of body.cards) {
    if (typeof card.ankiNoteId !== 'number' || typeof card.front !== 'string' || typeof card.back !== 'string') {
      return new Response('Each card needs ankiNoteId (number), front (string), back (string)', { status: 400 })
    }
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
    for (const media of card.media ?? []) {
      const knownSize = existingMediaByFilename.get(media.filename)
      if (knownSize === undefined || knownSize !== media.sizeBytes) mediaNeeded.add(media.filename)
    }
  }

  await db.batch(writes)

  return Response.json({ deckId, cardCount: body.cards.length, mediaNeeded: [...mediaNeeded] })
}
