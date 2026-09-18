// Unit tests for src/server/deckImportProcessing.js — specifically
// upsertCardChunk's card_media_refs bookkeeping (see migrations/
// 0009_create_card_media_refs.sql), which the end-to-end Workflow test
// (decks-import-workflow.test.js) exercises only in the simple/no-re-import
// case. This covers the stale-ref cleanup on re-import directly, since a
// bug there wouldn't fail loudly (a stale ref just means a future media
// chunk quietly fails to rewrite a card, or rewrites one that no longer
// actually references that file — the REPLACE()/instr() distinction doesn't
// apply here, since this table drives the lookup, not a text search).
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { upsertCardChunk, upsertDeckRow } from '../../src/server/deckImportProcessing.js'

beforeEach(async () => {
  await env.DB.exec('DELETE FROM decks')
  await env.DB.exec('DELETE FROM cards')
  await env.DB.exec('DELETE FROM card_media_refs')

  await upsertDeckRow({ db: env.DB, deck: { ankiDeckId: 500, name: 'Refs Deck', cardRows: [{}, {}] } })
})

async function refsFor(cardId) {
  const { results } = await env.DB.prepare('SELECT filename FROM card_media_refs WHERE card_id = ? ORDER BY filename').bind(cardId).all()
  return results.map((r) => r.filename)
}

describe('upsertCardChunk — card_media_refs', () => {
  it('records one row per (card, referenced filename)', async () => {
    await upsertCardChunk({
      db: env.DB,
      deckId: '500',
      cards: [{ ankiNoteId: 1, front: 'Q [sound:a.mp3]', back: 'A <img src="b.jpg">', mediaFilenames: ['a.mp3', 'b.jpg'] }],
    })

    expect(await refsFor('imported-500-1')).toEqual(['a.mp3', 'b.jpg'])
  })

  it('writes no rows for a card with no media references', async () => {
    await upsertCardChunk({
      db: env.DB,
      deckId: '500',
      cards: [{ ankiNoteId: 1, front: 'Q', back: 'A', mediaFilenames: [] }],
    })

    expect(await refsFor('imported-500-1')).toEqual([])
  })

  it('replaces stale refs when a re-imported card no longer references a filename', async () => {
    await upsertCardChunk({
      db: env.DB,
      deckId: '500',
      cards: [{ ankiNoteId: 1, front: 'Q [sound:old.mp3]', back: 'A', mediaFilenames: ['old.mp3'] }],
    })
    expect(await refsFor('imported-500-1')).toEqual(['old.mp3'])

    // Simulates a re-import where the note's template changed and it no
    // longer references old.mp3, but does now reference new.mp3.
    await upsertCardChunk({
      db: env.DB,
      deckId: '500',
      cards: [{ ankiNoteId: 1, front: 'Q [sound:new.mp3]', back: 'A', mediaFilenames: ['new.mp3'] }],
    })

    expect(await refsFor('imported-500-1')).toEqual(['new.mp3']) // old.mp3 gone, not left as an orphaned ref
  })

  it('keeps different cards\' refs independent', async () => {
    await upsertCardChunk({
      db: env.DB,
      deckId: '500',
      cards: [
        { ankiNoteId: 1, front: 'Q1 [sound:a.mp3]', back: 'A1', mediaFilenames: ['a.mp3'] },
        { ankiNoteId: 2, front: 'Q2 [sound:b.mp3]', back: 'A2', mediaFilenames: ['b.mp3'] },
      ],
    })

    expect(await refsFor('imported-500-1')).toEqual(['a.mp3'])
    expect(await refsFor('imported-500-2')).toEqual(['b.mp3'])
  })
})
