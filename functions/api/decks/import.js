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

// Mirrors [deckId]/media.js's rewrite — needed here too because re-importing
// a deck upserts front/back from the client's freshly-parsed (still
// filename-referencing) HTML, which would otherwise clobber the URL
// rewrites a *previous* import's media upload already applied, for any
// filename that hasn't actually changed since (FR-012).
function rewriteReference(text, filename, url) {
  return text
    .replaceAll(`[sound:${filename}]`, `[sound:${url}]`)
    .replaceAll(`src="${filename}"`, `src="${url}"`)
    .replaceAll(`src='${filename}'`, `src='${url}'`)
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
    .prepare('SELECT id, filename, size_bytes FROM media_assets WHERE deck_id = ?')
    .bind(deckId)
    .all()
  const existingMediaByFilename = new Map(existingMedia.results.map((row) => [row.filename, row]))

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
  // Caches, per filename, whether its recorded media_assets row's R2 object
  // was actually confirmed present — at most one R2 head() per unique
  // filename regardless of how many cards reference it, so a deck with
  // media shared across many cards doesn't multiply into an excessive
  // subrequest count.
  const r2ExistenceByFilename = new Map()

  for (const card of body.cards) {
    if (typeof card.ankiNoteId !== 'number' || typeof card.front !== 'string' || typeof card.back !== 'string') {
      return new Response('Each card needs ankiNoteId (number), front (string), back (string)', { status: 400 })
    }
    let front = card.front
    let back = card.back
    for (const media of card.media ?? []) {
      const known = existingMediaByFilename.get(media.filename)
      let confirmedGood = false
      if (known !== undefined && known.size_bytes === media.sizeBytes) {
        if (!r2ExistenceByFilename.has(media.filename)) {
          // A matching D1 row isn't proof the R2 object actually exists —
          // a request can die between the two writes (this is exactly how
          // the old synchronous media endpoint left a deck half-imported
          // when it hit Cloudflare's CPU-time limit mid-batch). Checking
          // R2 here means a broken deck self-heals on the next import
          // attempt instead of silently treating a missing object as
          // "already there" forever.
          r2ExistenceByFilename.set(media.filename, Boolean(await context.env.MEDIA.head(known.id)))
        }
        confirmedGood = r2ExistenceByFilename.get(media.filename)
      }

      if (confirmedGood) {
        const url = `/api/media/${known.id}`
        front = rewriteReference(front, media.filename, url)
        back = rewriteReference(back, media.filename, url)
      } else {
        mediaNeeded.add(media.filename)
      }
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
        .bind(cardId(deckId, card.ankiNoteId), deckId, card.ankiNoteId, front, back, now)
    )
  }

  await db.batch(writes)

  return Response.json({ deckId, cardCount: body.cards.length, mediaNeeded: [...mediaNeeded] })
}
