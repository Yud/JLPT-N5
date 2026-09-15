// POST /api/wanikani-words/sync
// Backs the "Sync from WaniKani" button on the Listening Quiz page. Fetches
// vocabulary from your WaniKani account (at or above WANIKANI_MIN_SRS_STAGE,
// default 7/Master) and wholesale-replaces D1's wanikani_words table with
// it — runs entirely server-side, in this Worker; the WaniKani API key
// (a Cloudflare Pages secret, see README) never reaches the browser.

const API_BASE = 'https://api.wanikani.com/v2'
const MAX_SRS_STAGE = 9 // Burned
const BATCH_SIZE = 100

async function wkFetch(apiKey, url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Wanikani-Revision': '20170710',
    },
  })
  if (!res.ok) throw new Error(`WaniKani API request failed (${res.status} ${res.statusText}): ${url}`)
  return res.json()
}

async function fetchAllPages(apiKey, startUrl) {
  const results = []
  let url = startUrl
  while (url) {
    const page = await wkFetch(apiKey, url)
    results.push(...page.data)
    url = page.pages?.next_url ?? null
  }
  return results
}

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
}

export async function onRequestPost(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

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

  await context.env.DB.prepare('DELETE FROM wanikani_words').run()

  const insertStatements = words.map((word) =>
    context.env.DB.prepare(
      'INSERT INTO wanikani_words (subject_id, characters, meanings, readings, level, srs_stage, audio) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      word.subjectId,
      word.characters,
      JSON.stringify(word.meanings),
      JSON.stringify(word.readings),
      word.level,
      word.srsStage,
      JSON.stringify(word.audio),
    ),
  )
  for (const batch of chunk(insertStatements, BATCH_SIZE)) {
    await context.env.DB.batch(batch)
  }

  return Response.json({ synced: words.length })
}
