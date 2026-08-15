// POST /api/reviews/:cardId  { grade: 'again' | 'hard' | 'good' | 'easy' }
// Scores one review and upserts the new schedule. Scheduling math lives in
// src/scheduling/scheduler.js so it's unit-testable without D1.

import { DECKS } from '../../../src/data/decks.js'
import { nextReviewState } from '../../../src/scheduling/scheduler.js'

const ALL_CARD_IDS = new Set(Object.values(DECKS).flatMap((set) => [...set]))
const GRADES = new Set(['again', 'hard', 'good', 'easy'])

export async function onRequestPost(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { cardId } = context.params
  if (!ALL_CARD_IDS.has(cardId)) return new Response(`Unknown card: ${cardId}`, { status: 404 })

  const body = await context.request.json().catch(() => null)
  if (!body || !GRADES.has(body.grade)) {
    return new Response(`grade must be one of: ${[...GRADES].join(', ')}`, { status: 400 })
  }

  const existing = await context.env.DB
    .prepare('SELECT due_at, interval_days, ease_factor, repetitions, lapses FROM card_review_state WHERE user_email = ? AND card_id = ?')
    .bind(email, cardId)
    .first()

  const next = nextReviewState(existing, body.grade)

  await context.env.DB
    .prepare(
      `INSERT INTO card_review_state (user_email, card_id, due_at, interval_days, ease_factor, repetitions, lapses, last_reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_email, card_id) DO UPDATE SET
         due_at = excluded.due_at,
         interval_days = excluded.interval_days,
         ease_factor = excluded.ease_factor,
         repetitions = excluded.repetitions,
         lapses = excluded.lapses,
         last_reviewed_at = excluded.last_reviewed_at`
    )
    .bind(email, cardId, next.due_at, next.interval_days, next.ease_factor, next.repetitions, next.lapses, next.last_reviewed_at)
    .run()

  return Response.json({ cardId, ...next })
}
