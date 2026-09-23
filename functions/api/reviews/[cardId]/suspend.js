// POST/DELETE /api/reviews/:cardId/suspend
// Permanently excludes (or restores) a card from this user's study queue —
// deliberately not Anki's "bury" (which auto-clears at the next day
// rollover): a deck routinely imports a non-card "Welcome to X deck!" note
// as a real card, and that needs to be gone for good, not just today.
// GET /api/reviews/due (functions/api/reviews/due.js) excludes anything
// with a row here. No unsuspend UI exists yet — DELETE is here for a manual
// undo and a future "manage suspended cards" screen.

import { isKnownCardId } from '../_shared.js'
import * as cardSuspensionsRepo from '../../../../shared/repos/cardSuspensionsRepo.js'

export async function onRequestPost(context) {
  const { email } = context.data
  const { cardId } = context.params
  if (!(await isKnownCardId(context.env.DB, cardId))) return new Response(`Unknown card: ${cardId}`, { status: 404 })

  await cardSuspensionsRepo.insert(context.env.DB, { userEmail: email, cardId, suspendedAt: Date.now() })

  return new Response(null, { status: 204 })
}

export async function onRequestDelete(context) {
  const { email } = context.data
  const { cardId } = context.params
  await cardSuspensionsRepo.remove(context.env.DB, { userEmail: email, cardId })

  return new Response(null, { status: 204 })
}
