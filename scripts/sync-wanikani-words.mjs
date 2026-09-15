#!/usr/bin/env node
// Local-dev-only helper: fetches vocabulary you've studied on WaniKani at
// or above a given SRS stage, together with their English meanings and
// pronunciation audio, and replaces the contents of your *local* D1
// wanikani_words table with it (see migrations/0002_create_wanikani_words.sql)
// — lets you build/test the Listening Quiz pillar against realistic data
// without touching production.
//
// Production's cache is refreshed by the "Sync from WaniKani" button on
// the Listening Quiz page (POST /api/wanikani-words/sync — see
// functions/api/wanikani-words/sync.js), which runs the equivalent fetch
// server-side against production D1. This script never touches remote D1.
//
// Requires WANIKANI_API_KEY (wanikani.com → Settings → API Tokens). Copy
// .env.example to .env and fill it in — this script reads .env itself, so
// nothing extra to install. The key is only ever used here, locally; it's
// never bundled into the app, sent to Cloudflare, or committed anywhere.
//
// Minimum SRS stage precedence: --min-srs-stage flag > WANIKANI_MIN_SRS_STAGE
// (.env) > built-in fallback of 6 (Guru II) — deliberately lower than
// production's Master default, so there's enough sample data to test with.
//
// Usage:
//   npm run sync:wanikani
//   npm run sync:wanikani -- --min-srs-stage=8

import { readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const API_BASE = 'https://api.wanikani.com/v2'
const D1_DATABASE = 'hiragana-db'
const MAX_SRS_STAGE = 9 // Burned

async function loadDotEnv() {
  let text
  try {
    text = await readFile(path.join(ROOT, '.env'), 'utf8')
  } catch {
    return // no .env — fine, maybe the var is already exported
  }
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (key in process.env) continue
    const value = rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue
    process.env[key] = value
  }
}

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

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

async function main() {
  await loadDotEnv()
  const apiKey = process.env.WANIKANI_API_KEY
  if (!apiKey) {
    console.error('WANIKANI_API_KEY is not set. Copy .env.example to .env and fill in your WaniKani API token.')
    process.exit(1)
  }

  const minStageArg = process.argv.find((arg) => arg.startsWith('--min-srs-stage='))
  const minSrsStage = minStageArg
    ? Number(minStageArg.split('=')[1])
    : process.env.WANIKANI_MIN_SRS_STAGE
      ? Number(process.env.WANIKANI_MIN_SRS_STAGE)
      : 6
  if (!Number.isInteger(minSrsStage) || minSrsStage < 1 || minSrsStage > MAX_SRS_STAGE) {
    console.error(`Minimum SRS stage must be an integer between 1 and ${MAX_SRS_STAGE} (got ${minSrsStage}).`)
    process.exit(1)
  }
  const srsStages = Array.from({ length: MAX_SRS_STAGE - minSrsStage + 1 }, (_, i) => minSrsStage + i)

  console.log(`Fetching vocabulary assignments at srs_stage >= ${minSrsStage}...`)
  const assignments = await fetchAllPages(
    apiKey,
    `${API_BASE}/assignments?subject_types=vocabulary&srs_stages=${srsStages.join(',')}`,
  )
  console.log(`Found ${assignments.length} matching assignments.`)

  const srsStageBySubjectId = new Map(assignments.map((a) => [a.data.subject_id, a.data.srs_stage]))
  const subjectIds = [...srsStageBySubjectId.keys()]

  const subjects = []
  for (const idsBatch of chunk(subjectIds, 200)) {
    subjects.push(...(await fetchAllPages(apiKey, `${API_BASE}/subjects?types=vocabulary&ids=${idsBatch.join(',')}`)))
  }

  // Words without any recorded audio can't be used for a listening quiz —
  // skip them rather than caching a word the game could never play.
  const words = subjects
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

  const statements = ['DELETE FROM wanikani_words;']
  for (const word of words) {
    statements.push(
      `INSERT INTO wanikani_words (subject_id, characters, meanings, readings, level, srs_stage, audio) VALUES (${[
        word.subjectId,
        sqlString(word.characters),
        sqlString(JSON.stringify(word.meanings)),
        sqlString(JSON.stringify(word.readings)),
        word.level,
        word.srsStage,
        sqlString(JSON.stringify(word.audio)),
      ].join(', ')});`,
    )
  }

  const sqlPath = path.join(os.tmpdir(), `wanikani-words-${Date.now()}.sql`)
  await writeFile(sqlPath, statements.join('\n'))
  try {
    console.log(`Writing ${words.length} words (of ${subjects.length} fetched) to local D1...`)
    execFileSync('npx', ['wrangler', 'd1', 'execute', D1_DATABASE, '--local', '--file', sqlPath], {
      cwd: ROOT,
      stdio: 'inherit',
    })
  } finally {
    await rm(sqlPath, { force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
