import { env, exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'

const AUTH = { 'Cf-Access-Authenticated-User-Email': 'test@example.com' }

async function getWords() {
  return exports.default.fetch('https://example.com/api/wanikani-words', { headers: AUTH })
}

async function insertWord(overrides = {}) {
  const word = {
    subjectId: 1,
    characters: '言葉',
    meanings: ['word', 'phrase'],
    readings: ['ことば'],
    level: 3,
    srsStage: 7,
    audio: [{ url: 'https://example.com/a.mp3', voiceActorId: 1 }],
    ...overrides,
  }
  await env.DB
    .prepare(
      'INSERT INTO wanikani_words (subject_id, characters, meanings, readings, level, srs_stage, audio) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(word.subjectId, word.characters, JSON.stringify(word.meanings), JSON.stringify(word.readings), word.level, word.srsStage, JSON.stringify(word.audio))
    .run()
}

// Storage isolation is per test *file*, not per test — clear explicitly so
// each test starts from a clean cache regardless.
beforeEach(async () => {
  await env.DB.exec('DELETE FROM wanikani_words')
})

describe('GET /api/wanikani-words', () => {
  it('rejects requests with no Access identity', async () => {
    const response = await exports.default.fetch('https://example.com/api/wanikani-words')
    expect(response.status).toBe(401)
  })

  it('returns an empty list when the cache is empty', async () => {
    const { words } = await (await getWords()).json()
    expect(words).toEqual([])
  })

  it('returns cached words with JSON fields parsed back into arrays/objects', async () => {
    await insertWord()

    const { words } = await (await getWords()).json()
    expect(words).toEqual([
      {
        id: 'wk-vocab-1',
        subjectId: 1,
        characters: '言葉',
        meanings: ['word', 'phrase'],
        readings: ['ことば'],
        level: 3,
        srsStage: 7,
        audio: [{ url: 'https://example.com/a.mp3', voiceActorId: 1 }],
      },
    ])
  })
})
