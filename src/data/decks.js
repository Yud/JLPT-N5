// Central registry of decks: a deck is just a named Set of card ids, so a
// card (defined once in its script's data file, e.g. kana.js) can belong to
// any number of decks — including decks built later from a mix of existing
// cards — without touching the card's own definition.

import { KANA } from './kana.js'

export const DECK_NAMES = Object.freeze({
  HIRAGANA: 'hiragana',
})

export const DECKS = {
  [DECK_NAMES.HIRAGANA]: new Set(KANA.map((c) => c.id)),
}
