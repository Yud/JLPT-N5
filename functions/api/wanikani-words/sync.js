// POST /api/wanikani-words/sync
// Backs the "Sync from WaniKani" button on the Listening Quiz page. Fetches
// vocabulary from your WaniKani account (at or above WANIKANI_MIN_SRS_STAGE,
// default 7/Master) and wholesale-replaces D1's wanikani_words table with
// it — runs entirely server-side, in this Worker; the WaniKani API key
// (a Cloudflare Pages secret, see README) never reaches the browser.

import * as wanikaniWordsRepo from '../../../shared/repos/wanikaniWordsRepo.js'
import { API_BASE, fetchAllPages } from '../../../shared/server/wanikaniApi.js'

const MAX_SRS_STAGE = 9 // Burned

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
}

export async function onRequestPost(context) {
  const apiKey = context.env.WANIKANI_API_KEY
  if (!apiKey) return new Response('WANIKANI_API_KEY is not configured on this deployment', { status: 500 })

  const minSrsStage = Number(context.env.WANIKANI_MIN_SRS_STAGE) || 7
  const srsStages = Array.from({ length: MAX_SRS_STAGE - minSrsStage + 1 }, (_, i) => minSrsStage + i)

  let words
  try {
    const assignments = await fetchAllPages(
      apiKey,
      `${API_BASE}/assignments?subject_types=vocabulary&srs_stages=${srsStages.join(',')}`,
    )
    const srsStageBySubjectId = new Map(assignments.map((a) => [a.data.subject_id, a.data.srs_stage]))
    const subjectIds = [...srsStageBySubjectId.keys()]

    const subjects = []
    for (const idsBatch of chunk(subjectIds, 200)) {
      subjects.push(...(await fetchAllPages(apiKey, `${API_BASE}/subjects?types=vocabulary&ids=${idsBatch.join(',')}`)))
    }

    // Words without any recorded audio can't be used for a listening quiz.
    words = subjects
      .map((subject) => {
        const audio = (subject.data.pronunciation_audios ?? [])
          .filter((a) => a.content_type === 'audio/mpeg')
          .map((a) => ({ url: a.url, voiceActorId: a.metadata?.voice_actor_id ?? null }))
        if (audio.length === 0) return null

        return {
          subjectId: subject.id,
          characters: subject.data.characters,
          meanings: subject.data.meanings.filter((m) => m.accepted_answer).map((m) => m.meaning),
          readings: (subject.data.readings ?? []).filter((r) => r.accepted_answer).map((r) => r.reading),
          level: subject.data.level,
          srsStage: srsStageBySubjectId.get(subject.id),
          audio,
        }
      })
      .filter(Boolean)
  } catch (err) {
    return new Response(`WaniKani sync failed: ${err.message}`, { status: 502 })
  }

  await wanikaniWordsRepo.replaceAll(context.env.DB, words)

  return Response.json({ synced: words.length })
}
