import { describe, expect, it } from 'vitest'
import { sortItems } from './useWanikaniLevel.js'

const items = [
  { subjectId: 1, availableAt: '2026-09-26T10:00:00.000000Z' },
  { subjectId: 2, availableAt: null },
  { subjectId: 3, availableAt: '2026-09-25T10:00:00.000000Z' },
  { subjectId: 4, availableAt: '2026-09-27T10:00:00.000000Z' },
]

const ids = (list) => list.map((item) => item.subjectId)

describe('sortItems', () => {
  it('keeps the original order for "default"', () => {
    expect(ids(sortItems(items, 'default'))).toEqual([1, 2, 3, 4])
  })

  it('sorts soonest first, with no-review items last', () => {
    expect(ids(sortItems(items, 'next-asc'))).toEqual([3, 1, 4, 2])
  })

  it('sorts latest first, still with no-review items last', () => {
    expect(ids(sortItems(items, 'next-desc'))).toEqual([4, 1, 3, 2])
  })

  it('does not mutate the input', () => {
    sortItems(items, 'next-asc')
    expect(ids(items)).toEqual([1, 2, 3, 4])
  })
})
