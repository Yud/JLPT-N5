// GET /api/wanikani/level?level=N
// Backs the WaniKani Levels page (#/wanikani-levels): every subject in one
// WaniKani level (radicals, kanji, vocabulary) plus when each is next up for
// review. Proxied live from your WaniKani account rather than cached in D1
// like the listening quiz's word list — `available_at` changes after every
// review done on WaniKani itself, so any stored copy would be stale almost
// immediately. One level is ~100-200 subjects, so this is a bounded handful
// of WaniKani requests (user + one page each of subjects/assignments).
//
// `level` is optional — omitted, it defaults to your current WaniKani level.
// The response also carries `userLevel` and `maxLevel` so the page can build
// its level picker without a separate request.

import { API_BASE, fetchAllPages, wkFetch } from '../../../shared/server/wanikaniApi.js'

// WaniKani's own lesson order: radicals, then kanji, then vocabulary.
const TYPE_ORDER = { radical: 0, kanji: 1, vocabulary: 2, kana_vocabulary: 3 }

// 'locked'  — not unlocked yet (no assignment exists)
// 'lesson'  — unlocked, waiting in the lesson queue
// 'burned'  — finished; will never come up again
// 'review'  — in the SRS cycle; `availableAt` says when it's next due
function itemState(assignment) {
  if (!assignment) return 'locked'
  if (assignment.burned_at) return 'burned'
  if (!assignment.started_at) return 'lesson'
  return 'review'
}

function toItem(subject, assignment) {
  const data = subject.data
  return {
    subjectId: subject.id,
    type: subject.object,
    characters: data.characters,
    // Some radicals have no Unicode character, only an image.
    characterImageUrl: data.characters
      ? null
      : (data.character_images ?? []).find((img) => img.content_type === 'image/svg+xml')?.url ?? null,
    meaning: data.meanings.find((m) => m.primary)?.meaning ?? data.meanings[0]?.meaning ?? '',
    reading: (data.readings ?? []).find((r) => r.primary)?.reading ?? null,
    lessonPosition: data.lesson_position,
    srsStage: assignment?.srs_stage ?? null,
    state: itemState(assignment),
    availableAt: assignment?.available_at ?? null,
  }
}

export async function onRequestGet(context) {
  const requestedParam = new URL(context.request.url).searchParams.get('level')
  const requestedLevel = requestedParam === null ? null : Number(requestedParam)
  if (requestedLevel !== null && !(Number.isInteger(requestedLevel) && requestedLevel >= 1)) {
    return new Response('level must be a positive integer', { status: 400 })
  }

  const apiKey = context.env.WANIKANI_API_KEY
  if (!apiKey) return new Response('WANIKANI_API_KEY is not configured on this deployment', { status: 500 })

  let user, level, subjects, assignments
  try {
    // With an explicit level, the user lookup doesn't gate the other two —
    // fire all three at once. Without one, it has to resolve first.
    const userPromise = wkFetch(apiKey, `${API_BASE}/user`)
    level = requestedLevel ?? (await userPromise).data.level
    ;[user, subjects, assignments] = await Promise.all([
      userPromise,
      fetchAllPages(apiKey, `${API_BASE}/subjects?levels=${level}&hidden=false`),
      fetchAllPages(apiKey, `${API_BASE}/assignments?levels=${level}&hidden=false`),
    ])
  } catch (err) {
    return new Response(`WaniKani request failed: ${err.message}`, { status: 502 })
  }

  const assignmentBySubjectId = new Map(assignments.map((a) => [a.data.subject_id, a.data]))
  const items = subjects
    .map((subject) => toItem(subject, assignmentBySubjectId.get(subject.id)))
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.lessonPosition - b.lessonPosition)

  return Response.json({
    level,
    userLevel: user.data.level,
    maxLevel: user.data.subscription.max_level_granted,
    items,
  })
}
