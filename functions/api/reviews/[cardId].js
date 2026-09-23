// POST /api/reviews/:cardId  { grade: 'again' | 'hard' | 'good' | 'easy' }
// Scores one review and upserts the new schedule. Scheduling math lives in
// shared/scheduling/scheduler.js so it's unit-testable without D1.

import { nextReviewState } from '../../../shared/scheduling/scheduler.js'
import { isKnownCardId } from './_shared.js'
import * as cardReviewStateRepo from '../../../shared/repos/cardReviewStateRepo.js'

const GRADES = new Set(['again', 'hard', 'good', 'easy'])

export async function onRequestPost(context) {
  const { email } = context.data
  const { cardId } = context.params
  const db = context.env.DB
  if (!(await isKnownCardId(db, cardId))) return new Response(`Unknown card: ${cardId}`, { status: 404 })

  const body = await context.request.json().catch(() => null)
  if (!body || !GRADES.has(body.grade)) {
    return new Response(`grade must be one of: ${[...GRADES].join(', ')}`, { status: 400 })
  }

  const existing = await cardReviewStateRepo.get(db, { userEmail: email, cardId })

  const next = nextReviewState(existing, body.grade)
  // Write-once: set on insert, left out of the upsert's DO UPDATE SET below
  // so a second/third review never overwrites it — the daily new-card cap
  // (shared/scheduling/studyQueue.js) needs this card's *first* review time,
  // which last_reviewed_at can't answer once it's been reviewed again.
  const firstReviewedAt = existing?.first_reviewed_at ?? next.last_reviewed_at

  await cardReviewStateRepo.upsert(db, {
    userEmail: email,
    cardId,
    dueAt: next.due_at,
    intervalDays: next.interval_days,
    easeFactor: next.ease_factor,
    repetitions: next.repetitions,
    lapses: next.lapses,
    lastReviewedAt: next.last_reviewed_at,
    firstReviewedAt,
  })

  return Response.json({ cardId, ...next, first_reviewed_at: firstReviewedAt })
}
