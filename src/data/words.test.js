import { describe, it, expect } from 'vitest'
import { WORDS, getVocabCategories, getWordsForCategory } from './words.js'
import { KANA } from './kana.js'

describe('WORDS', () => {
  it('has a unique, non-empty id for every word', () => {
    const ids = WORDS.map((w) => w.id)
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only uses glyphs that exist in KANA', () => {
    const kanaGlyphs = new Set(KANA.map((c) => c.kana))
    for (const word of WORDS) {
      for (const glyph of word.kana) {
        expect(kanaGlyphs.has(glyph)).toBe(true)
      }
    }
  })
})

describe('getVocabCategories', () => {
  it('has no two groups sharing an id', () => {
    const ids = getVocabCategories().map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ends with an "all" group', () => {
    const groups = getVocabCategories()
    expect(groups.at(-1)).toMatchObject({ id: 'all', kind: 'all' })
  })
})

describe('getWordsForCategory', () => {
  it('returns only words in a single category for a string id', () => {
    const words = getWordsForCategory('numbers')
    expect(words.length).toBeGreaterThan(0)
    expect(words.every((w) => w.category === 'numbers')).toBe(true)
  })

  it('unions multiple category ids, deduplicated, when given an array', () => {
    const numbers = getWordsForCategory('numbers')
    const colors = getWordsForCategory('colors')
    const union = getWordsForCategory(['numbers', 'colors'])
    expect(union.length).toBe(numbers.length + colors.length)

    const overlapping = getWordsForCategory(['numbers', 'numbers'])
    expect(overlapping.length).toBe(numbers.length)
  })

  it('returns every word when "all" is one of several ids', () => {
    expect(getWordsForCategory(['all', 'numbers'])).toBe(getWordsForCategory('all'))
  })
})
