import { describe, it, expect } from 'vitest'
import { useListeningQuizSession } from './useListeningQuizSession.js'

// A single-word list makes the shuffle a no-op, so every test
// deterministically gets this word.
const KOTOBA = { id: 'wk-vocab-1', characters: '言葉', meanings: ['word', 'phrase'], readings: ['ことば'], audio: [{ url: 'https://example.com/kotoba.mp3' }] }

describe('useListeningQuizSession', () => {
  it('grades an answer matching any accepted meaning as correct', () => {
    const quiz = useListeningQuizSession([KOTOBA])
    quiz.answer.value = 'Phrase'
    quiz.submitAnswer()
    expect(quiz.checked.value).toBe(true)
    expect(quiz.correct.value).toBe(true)
    expect(quiz.score.value).toEqual({ correct: 1, total: 1 })
  })

  it('is forgiving of stray punctuation and casing', () => {
    const quiz = useListeningQuizSession([KOTOBA])
    quiz.answer.value = " word! "
    quiz.submitAnswer()
    expect(quiz.correct.value).toBe(true)
  })

  it('grades a non-matching answer as incorrect without crashing', () => {
    const quiz = useListeningQuizSession([KOTOBA])
    quiz.answer.value = 'banana'
    quiz.submitAnswer()
    expect(quiz.correct.value).toBe(false)
    expect(quiz.score.value).toEqual({ correct: 0, total: 1 })
  })

  it('does not re-grade once checked', () => {
    const quiz = useListeningQuizSession([KOTOBA])
    quiz.submitAnswer()
    quiz.answer.value = 'word'
    quiz.submitAnswer()
    expect(quiz.score.value.total).toBe(1)
  })

  it('advances to complete after the last word', () => {
    const quiz = useListeningQuizSession([KOTOBA])
    expect(quiz.complete.value).toBe(false)
    quiz.next()
    expect(quiz.complete.value).toBe(true)
    expect(quiz.currentWord.value).toBe(null)
  })

  it('restart reshuffles and resets score and progress', () => {
    const quiz = useListeningQuizSession([KOTOBA])
    quiz.submitAnswer()
    quiz.next()
    quiz.restart()
    expect(quiz.complete.value).toBe(false)
    expect(quiz.score.value).toEqual({ correct: 0, total: 0 })
    expect(quiz.currentWord.value).toEqual(KOTOBA)
  })
})
