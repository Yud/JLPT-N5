// Central registry of decks: a deck is just a named Set of card ids, so a
// card (defined once in its script's data file, e.g. kana.js) can belong to
// any number of decks — including decks built later from a mix of existing
// cards — without touching the card's own definition.

import { KANA } from './kana.js'
import { KATAKANA } from './katakana.js'
import { WORDS } from './words.js'

export const DECK_NAMES = Object.freeze({
  HIRAGANA: 'hiragana',
  KATAKANA: 'katakana',
  VOCABULARY: 'vocabulary',
})

export const DECKS = {
  [DECK_NAMES.HIRAGANA]: new Set(KANA.map((c) => c.id)),
  [DECK_NAMES.KATAKANA]: new Set(KATAKANA.map((c) => c.id)),
  [DECK_NAMES.VOCABULARY]: new Set(WORDS.map((w) => w.id)),
}
