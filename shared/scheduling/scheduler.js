const MIN_EASE_FACTOR = 1.3
const DAY_MS = 24 * 60 * 60 * 1000

const EASE_DELTA = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 }

const DEFAULT_STATE = {
  interval_days: 0,
  ease_factor: 2.5,
  repetitions: 0,
  lapses: 0,
}

/**
 * SM-2-derived scheduler using the classic Again/Hard/Good/Easy grading scale.
 * `prev` is the existing review-state row (or null/undefined for a card's
 * first-ever review). Returns the full next state to persist.
 */
export function nextReviewState(prev, grade, now = Date.now()) {
  const state = prev ?? DEFAULT_STATE
  const ease_factor = Math.max(MIN_EASE_FACTOR, state.ease_factor + EASE_DELTA[grade])

  if (grade === 'again') {
    return {
      ease_factor,
      repetitions: 0,
      interval_days: 0,
      lapses: state.lapses + 1,
      due_at: now, // resurface later in this same session, not tomorrow
      last_reviewed_at: now,
    }
  }

  const repetitions = state.repetitions + 1
  let interval_days
  if (repetitions === 1) interval_days = 1
  else if (repetitions === 2) interval_days = grade === 'hard' ? 2 : grade === 'easy' ? 4 : 3
  else interval_days = Math.round(state.interval_days * ease_factor * (grade === 'hard' ? 0.8 : grade === 'easy' ? 1.3 : 1))

  return {
    ease_factor,
    repetitions,
    interval_days,
    lapses: state.lapses,
    due_at: now + interval_days * DAY_MS,
    last_reviewed_at: now,
  }
}
