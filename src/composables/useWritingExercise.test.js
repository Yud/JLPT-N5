import { describe, it, expect } from 'vitest'
import { useWritingExercise } from './useWritingExercise.js'

// A single-word list makes nextWord()'s queue shuffle a no-op, so every test
// deterministically gets this word — repeating "se" mirrors the real
// "sensei" bug report (a learner unable to reuse a repeated glyph).
const SENSEI = { romaji: 'sensei', kana: ['せ', 'ん', 'せ', 'い'] }

function buttonFor(writer, kana) {
  return writer.buttons.value.find((b) => b.kana === kana)
}

describe('useWritingExercise', () => {
  it('includes exactly one button per glyph, even ones the word repeats', () => {
    const writer = useWritingExercise([SENSEI])
    const seButtons = writer.buttons.value.filter((b) => b.kana === 'せ')
    expect(seButtons).toHaveLength(1)
  })

  it('keeps a repeated glyph selectable for its later occurrence(s)', () => {
    const writer = useWritingExercise([SENSEI])
    const se = buttonFor(writer, 'せ')
    const n = buttonFor(writer, 'ん')
    const i = buttonFor(writer, 'い')

    expect(writer.isExhausted(se)).toBe(false)

    writer.select(se) // 1st occurrence (position 0)
    expect(writer.status.value).toBe('in-progress')
    expect(writer.isExhausted(se)).toBe(false) // still needed again at position 2

    writer.select(n) // position 1
    expect(writer.status.value).toBe('in-progress')
    expect(writer.isExhausted(se)).toBe(false)

    writer.select(se) // 2nd occurrence (position 2)
    expect(writer.status.value).toBe('in-progress')
    expect(writer.isExhausted(se)).toBe(true) // both occurrences now used

    writer.select(i) // position 3, completes the word
    expect(writer.status.value).toBe('correct')
  })

  it('never marks a glyph the word doesn\'t need as exhausted', () => {
    const writer = useWritingExercise([SENSEI])
    const distractor = writer.buttons.value.find((b) => !SENSEI.kana.includes(b.kana))
    expect(distractor).toBeDefined()
    expect(writer.isExhausted(distractor)).toBe(false)

    writer.select(distractor) // wrong answer — still shouldn't become "exhausted"
    expect(writer.isExhausted(distractor)).toBe(false)
  })
})
