import { ref } from 'vue'
import { parseAnkiPackage } from '../data/ankiImport.js'

// Stay comfortably under Cloudflare's per-request body cap (100MB on
// Free/Pro — research.md §3) rather than uploading a deck's media in one
// request; batches also let a slow/failed request retry without redoing an
// entire deck's upload.
const MAX_BATCH_BYTES = 20 * 1024 * 1024

function batchFilenames(filenames, mediaByFilename) {
  const batches = []
  let current = []
  let currentBytes = 0
  for (const filename of filenames) {
    const bytes = mediaByFilename.get(filename)
    if (!bytes) continue // referenced in a card but never found in the archive — surfaced as a warning, not a hard failure
    if (current.length > 0 && currentBytes + bytes.length > MAX_BATCH_BYTES) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(filename)
    currentBytes += bytes.length
  }
  if (current.length > 0) batches.push(current)
  return batches
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`)
  return response.json()
}

/**
 * Drives importing an Anki .apkg file (specs/003-anki-deck-import): parses
 * it entirely client-side (src/data/ankiImport.js), then uploads the result
 * to the backend — one deck per Anki sub-deck (FR-011), each deck's media
 * in size-bounded batches (research.md §3) rather than one giant request.
 */
export function useDeckImport() {
  const status = ref('idle') // 'idle' | 'parsing' | 'uploading' | 'done' | 'error'
  const message = ref('')
  const progress = ref({ decksImported: 0, decksTotal: 0, mediaUploaded: 0, mediaTotal: 0 })

  async function importFile(file) {
    status.value = 'parsing'
    message.value = ''
    progress.value = { decksImported: 0, decksTotal: 0, mediaUploaded: 0, mediaTotal: 0 }

    try {
      const { decks, media } = await parseAnkiPackage(await file.arrayBuffer())
      if (decks.length === 0) throw new Error('No cards were found in this file.')

      progress.value.decksTotal = decks.length
      status.value = 'uploading'

      let totalCards = 0
      for (const deck of decks) {
        const { deckId, mediaNeeded } = await postJson('/api/decks/import', {
          ankiDeckId: deck.ankiDeckId,
          deckName: deck.name,
          cards: deck.cards.map(({ ankiNoteId, front, back, media: cardMedia }) => ({
            ankiNoteId,
            front,
            back,
            media: cardMedia,
          })),
        })
        totalCards += deck.cards.length

        progress.value.mediaTotal += mediaNeeded.length
        for (const batch of batchFilenames(mediaNeeded, media)) {
          const formData = new FormData()
          for (const filename of batch) formData.append(filename, new Blob([media.get(filename)]), filename)
          const response = await fetch(`/api/decks/${deckId}/media`, { method: 'POST', body: formData })
          if (!response.ok) throw new Error((await response.text()) || `Media upload failed: ${response.status}`)
          const { stored } = await response.json()
          progress.value.mediaUploaded += stored.length
        }

        progress.value.decksImported += 1
      }

      status.value = 'done'
      message.value = `Imported ${decks.length} deck${decks.length === 1 ? '' : 's'} (${totalCards} card${totalCards === 1 ? '' : 's'}).`
    } catch (err) {
      status.value = 'error'
      message.value = err.message || 'Import failed.'
    }
  }

  return { status, message, progress, importFile }
}
