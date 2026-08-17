import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFlashcardSession } from './useFlashcardSession.js'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true })),
  )
})

describe('useCardSession (via useFlashcardSession)', () => {
  it('shuffles without repeats within a pass', () => {
    const session = useFlashcardSession('a')
    const seen = new Set()
    while (!session.complete.value) {
      seen.add(session.currentCharacter.value.id)
      session.next()
    }
    expect(seen.size).toBe(session.progress.value.total)
  })

  it('reveal shows the answer, next advances, and the session completes', () => {
    const session = useFlashcardSession('nn')
    expect(session.progress.value).toEqual({ index: 0, total: 1 })
    expect(session.revealed.value).toBe(false)

    session.reveal()
    expect(session.revealed.value).toBe(true)

    session.next()
    expect(session.complete.value).toBe(true)
    expect(session.currentCharacter.value).toBe(null)
  })

  it('restart reshuffles the same scope and resets state', () => {
    const session = useFlashcardSession('a')
    session.reveal()
    session.next()
    session.restart()
    expect(session.progress.value.index).toBe(0)
    expect(session.revealed.value).toBe(false)
    expect(session.complete.value).toBe(false)
  })

  it('grade advances to the next card without waiting on the network request', () => {
    const session = useFlashcardSession('nn')
    session.grade('good')
    expect(session.complete.value).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/api/reviews/hiragana-n', expect.objectContaining({ method: 'POST' }))
  })
})
