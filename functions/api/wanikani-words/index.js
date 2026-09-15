// GET /api/wanikani-words
// Returns the cached WaniKani vocabulary (word, meanings, readings,
// pronunciation audio) for the listening quiz. The cache lives in D1,
// populated by scripts/sync-wanikani-words.mjs run locally against your own
// WaniKani account — this endpoint only ever reads it back.

export async function onRequestGet(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { results } = await context.env.DB
    .prepare('SELECT subject_id, characters, meanings, readings, level, srs_stage, audio FROM wanikani_words')
    .all()

  const words = results.map((row) => ({
    id: `wk-vocab-${row.subject_id}`,
    subjectId: row.subject_id,
    characters: row.characters,
    meanings: JSON.parse(row.meanings),
    readings: JSON.parse(row.readings),
    level: row.level,
    srsStage: row.srs_stage,
    audio: JSON.parse(row.audio),
  }))

  return Response.json({ words })
}
