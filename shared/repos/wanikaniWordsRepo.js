// All D1 access for the `wanikani_words` table (migrations/0002_create_wanikani_words.sql).

const BATCH_SIZE = 100

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
}

export async function list(db) {
  const { results } = await db
    .prepare('SELECT subject_id, characters, meanings, readings, level, srs_stage, audio FROM wanikani_words')
    .all()
  return results
}

/** Wholesale-replaces the table's contents — backs the "Sync from WaniKani" flow. */
export async function replaceAll(db, words) {
  await db.prepare('DELETE FROM wanikani_words').run()

  const insertStatements = words.map((word) =>
    db
      .prepare(
        'INSERT INTO wanikani_words (subject_id, characters, meanings, readings, level, srs_stage, audio) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(
        word.subjectId,
        word.characters,
        JSON.stringify(word.meanings),
        JSON.stringify(word.readings),
        word.level,
        word.srsStage,
        JSON.stringify(word.audio)
      )
  )
  for (const batch of chunk(insertStatements, BATCH_SIZE)) {
    await db.batch(batch)
  }
}
