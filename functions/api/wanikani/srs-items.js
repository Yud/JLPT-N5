// GET /api/wanikani/srs-items?stage=N[&after=ID]
// Backs the WaniKani SRS page (#/wanikani-srs): every subject you have at
// one SRS stage (0 = lesson queue, 1-4 Apprentice, 5-6 Guru, 7 Master,
// 8 Enlightened, 9 Burned), across all WaniKani levels, plus when each is
// next up for review. Proxied live from your WaniKani account rather than
// cached in D1 like the listening quiz's word list — `available_at` changes
// after every review done on WaniKani itself, so any stored copy would be
// stale almost immediately.
//
// Paginated: one call covers one WaniKani assignments page (up to 500) plus
// the subjects for exactly those assignments — 2 WaniKani requests,
// regardless of how big the stage is. A late stage like Burned can run to
// thousands of items, which fetched in one invocation would blow Workers
// Free's 50-subrequest cap; instead the client follows `nextAfter` with
// further calls until it's null.

import { API_BASE, fetchAllPages, wkFetch } from '../../../shared/server/wanikaniApi.js'

const MAX_SRS_STAGE = 9 // Burned

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
    level: data.level,
    lessonPosition: data.lesson_position,
    srsStage: assignment.srs_stage,
    // null for lesson-queue (never started) and burned items — neither
    // has an upcoming review.
    availableAt: assignment.burned_at ? null : assignment.available_at,
  }
}

function parseNonNegativeInt(value) {
  const n = Number(value)
  return value !== null && value !== '' && Number.isInteger(n) && n >= 0 ? n : null
}

export async function onRequestGet(context) {
  const params = new URL(context.request.url).searchParams
  const stage = parseNonNegativeInt(params.get('stage'))
  if (stage === null || stage > MAX_SRS_STAGE) {
    return new Response(`stage must be an integer from 0 to ${MAX_SRS_STAGE}`, { status: 400 })
  }
  const after = params.has('after') ? parseNonNegativeInt(params.get('after')) : undefined
  if (after === null) return new Response('after must be a non-negative integer', { status: 400 })

  const apiKey = context.env.WANIKANI_API_KEY
  if (!apiKey) return new Response('WANIKANI_API_KEY is not configured on this deployment', { status: 500 })

  let assignmentsPage, subjects
  try {
    const assignmentsUrl = new URL(`${API_BASE}/assignments`)
    assignmentsUrl.searchParams.set('srs_stages', String(stage))
    assignmentsUrl.searchParams.set('hidden', 'false')
    if (after !== undefined) assignmentsUrl.searchParams.set('page_after_id', String(after))
    assignmentsPage = await wkFetch(apiKey, assignmentsUrl.toString())

    const subjectIds = assignmentsPage.data.map((a) => a.data.subject_id)
    // ≤500 ids (one assignments page) always fits in one subjects page
    // (1000), so this is a single request in practice.
    subjects = subjectIds.length ? await fetchAllPages(apiKey, `${API_BASE}/subjects?ids=${subjectIds.join(',')}`) : []
  } catch (err) {
    return new Response(`WaniKani request failed: ${err.message}`, { status: 502 })
  }

  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const items = assignmentsPage.data
    .filter((a) => subjectById.has(a.data.subject_id))
    .map((a) => toItem(subjectById.get(a.data.subject_id), a.data))

  const nextUrl = assignmentsPage.pages?.next_url
  const nextAfter = nextUrl ? Number(new URL(nextUrl).searchParams.get('page_after_id')) : null

  return Response.json({ stage, items, nextAfter, total: assignmentsPage.total_count })
}
