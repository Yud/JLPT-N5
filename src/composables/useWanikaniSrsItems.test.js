import { describe, expect, it } from 'vitest'
import { sortItems } from './useWanikaniSrsItems.js'

const items = [
  { subjectId: 1, level: 2, type: 'kanji', lessonPosition: 0, availableAt: '2026-09-26T10:00:00.000000Z' },
  { subjectId: 2, level: 1, type: 'vocabulary', lessonPosition: 5, availableAt: null },
  { subjectId: 3, level: 2, type: 'radical', lessonPosition: 3, availableAt: '2026-09-25T10:00:00.000000Z' },
  { subjectId: 4, level: 1, type: 'vocabulary', lessonPosition: 1, availableAt: '2026-09-27T10:00:00.000000Z' },
]

const ids = (list) => list.map((item) => item.subjectId)

describe('sortItems', () => {
  it('sorts "default" by level, then type, then lesson position', () => {
    expect(ids(sortItems(items, 'default'))).toEqual([4, 2, 3, 1])
  })

  it('sorts soonest first, with no-review items last', () => {
    expect(ids(sortItems(items, 'next-asc'))).toEqual([3, 1, 4, 2])
  })

  it('sorts latest first, still with no-review items last', () => {
    expect(ids(sortItems(items, 'next-desc'))).toEqual([4, 1, 3, 2])
  })

  it('does not mutate the input', () => {
    sortItems(items, 'default')
    sortItems(items, 'next-asc')
    expect(ids(items)).toEqual([1, 2, 3, 4])
  })
})
