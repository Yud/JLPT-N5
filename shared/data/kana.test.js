import { describe, it, expect } from 'vitest'
import { KANA, getPracticeGroups, getCharactersForGroup } from './kana.js'

describe('KANA', () => {
  it('has a unique, non-empty id for every card', () => {
    const ids = KANA.map((c) => c.id)
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('getPracticeGroups', () => {
  it('has no two row groups sharing a label', () => {
    const rowLabels = getPracticeGroups()
      .filter((g) => g.kind === 'row')
      .map((g) => g.label)
    expect(new Set(rowLabels).size).toBe(rowLabels.length)
  })
})

describe('getCharactersForGroup', () => {
  it('returns a single row for a string id', () => {
    expect(getCharactersForGroup('a').map((c) => c.kana)).toEqual(['あ', 'い', 'う', 'え', 'お'])
  })

  it('unions multiple row ids, deduplicated, when given an array', () => {
    const chars = getCharactersForGroup(['a', 'k'])
    expect(chars.map((c) => c.kana)).toEqual(['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ'])

    const overlapping = getCharactersForGroup(['a', 'a'])
    expect(overlapping.map((c) => c.kana)).toEqual(['あ', 'い', 'う', 'え', 'お'])
  })

  it('returns every character when "all" is one of several ids', () => {
    expect(getCharactersForGroup(['all', 'a'])).toBe(getCharactersForGroup('all'))
  })
})
