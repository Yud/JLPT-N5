// GET /api/wanikani-words
// Returns the cached WaniKani vocabulary (word, meanings, readings,
// pronunciation audio) for the listening quiz. The cache lives in D1,
// populated by scripts/sync-wanikani-words.mjs run locally against your own
// WaniKani account — this endpoint only ever reads it back.

import * as wanikaniWordsRepo from '../../../shared/repos/wanikaniWordsRepo.js'

export async function onRequestGet(context) {
  const results = await wanikaniWordsRepo.list(context.env.DB)

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
