import { describe, it, expect } from 'vitest'
import { nextReviewState } from './scheduler.js'

const NOW = Date.parse('2026-08-16T00:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

describe('nextReviewState', () => {
  it('schedules a new card one day out on a first "good"', () => {
    const next = nextReviewState(undefined, 'good', NOW)
    expect(next.repetitions).toBe(1)
    expect(next.interval_days).toBe(1)
    expect(next.due_at).toBe(NOW + DAY_MS)
  })

  it('resets repetitions/interval and bumps lapses on "again"', () => {
    const prev = { ease_factor: 2.5, repetitions: 4, interval_days: 20, lapses: 1 }
    const next = nextReviewState(prev, 'again', NOW)
    expect(next.repetitions).toBe(0)
    expect(next.interval_days).toBe(0)
    expect(next.lapses).toBe(2)
    expect(next.due_at).toBe(NOW)
    expect(next.ease_factor).toBeCloseTo(2.3)
  })

  it('never drops ease factor below the floor', () => {
    const prev = { ease_factor: 1.35, repetitions: 3, interval_days: 5, lapses: 3 }
    const next = nextReviewState(prev, 'again', NOW)
    expect(next.ease_factor).toBe(1.3)
  })

  it('grows the interval faster on repeated "easy" than repeated "good"', () => {
    let good = undefined
    let easy = undefined
    for (const grade of ['good', 'good', 'good']) good = nextReviewState(good, grade, NOW)
    for (const grade of ['easy', 'easy', 'easy']) easy = nextReviewState(easy, grade, NOW)
    expect(easy.interval_days).toBeGreaterThan(good.interval_days)
  })
})
