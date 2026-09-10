import { describe, it, expect } from 'vitest'
import { DAY_COUNTERS, THING_COUNTERS } from './kanji.js'

describe.each([
  ['DAY_COUNTERS', DAY_COUNTERS],
  ['THING_COUNTERS', THING_COUNTERS],
])('%s', (_name, set) => {
  it('has ten entries numbered 1 through 10 in order', () => {
    expect(set.map((item) => item.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('has a unique, non-empty id for every entry', () => {
    const ids = set.map((item) => item.id)
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has non-empty kanji, reading, and romaji for every entry', () => {
    for (const item of set) {
      expect(item.kanji.length).toBeGreaterThan(0)
      expect(item.reading.length).toBeGreaterThan(0)
      expect(item.romaji.length).toBeGreaterThan(0)
    }
  })
})
