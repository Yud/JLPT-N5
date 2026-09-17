// Parses an Anki .apkg export entirely in the browser (specs/003-anki-deck-import,
// research.md §1-2) — nothing here ever sends the raw file to the backend. The
// backend only ever receives the extracted result: card text (useDeckImport.js's
// POST /api/decks/import) and referenced media bytes (its POST .../media loop).
//
// A .apkg is a zip containing:
//   - collection.anki21b (current Anki) or collection.anki21/.anki2 (older) —
//     the real card database, either plain SQLite or Zstandard-compressed SQLite.
//   - a `media` manifest mapping the zip's numbered entries ("0", "1", ...) back
//     to real filenames — either a plain JSON object (older Anki) or a
//     Zstandard-compressed, protobuf-encoded list of {name, size, sha1} (current
//     Anki). Verified against a real ~100MB sample deck during planning.
import JSZip from 'jszip'
import { decompress as zstdDecompress } from 'fzstd'
import initSqlJs from 'sql.js'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const FIELD_SEPARATOR = '\x1f'
const DEFAULT_DECK_ID = 1 // Anki's built-in "Default" deck — imported only if it actually holds cards

// sql.js's Emscripten glue code resolves its .wasm via internal fetch/fs
// heuristics keyed off a `new URL(..., import.meta.url)` path that Vite's
// import-analysis rewrites at build time — a path only a real browser can
// fetch, so under Vitest (which simulates browser import.meta.url semantics
// inside plain Node — see ankiImport.test.js) it 404s/ENOENTs regardless of
// `locateFile`/`wasmBinary`. Supplying `instantiateWasm` bypasses all of
// that: it's Emscripten's own documented escape hatch, checked before any of
// its internal URL logic runs, so we fetch/read the bytes ourselves (browser
// vs Node) and instantiate directly.
async function loadWasmBinary() {
  const isNode = typeof process !== 'undefined' && process.versions?.node
  if (isNode) {
    const [{ readFile }, { default: path }] = await Promise.all([import('node:fs/promises'), import('node:path')])
    return readFile(path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))
  }
  const response = await fetch(sqlWasmUrl)
  return new Uint8Array(await response.arrayBuffer())
}

let sqlJsPromise
function loadSqlJs() {
  sqlJsPromise ??= loadWasmBinary().then((wasmBytes) =>
    initSqlJs({
      instantiateWasm(imports, successCallback) {
        WebAssembly.instantiate(wasmBytes, imports).then(({ instance }) => successCallback(instance))
        return {}
      },
    })
  )
  return sqlJsPromise
}

function looksZstdCompressed(bytes) {
  return ZSTD_MAGIC.every((b, i) => bytes[i] === b)
}

async function maybeDecompress(bytes) {
  return looksZstdCompressed(bytes) ? zstdDecompress(bytes) : bytes
}

// --- Minimal protobuf reader (varint + length-delimited fields only) ---
// Anki's newer package format uses a handful of small, fixed protobuf
// messages (the media manifest, template configs). A full protobuf runtime
// is unnecessary weight for reading two fixed schemas — see research.md §1.

function readVarint(bytes, offset) {
  let result = 0
  let shift = 0
  let i = offset
  for (;;) {
    const byte = bytes[i++]
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return [result >>> 0, i]
}

// Reads every top-level field of a protobuf message, returning
// { [fieldNumber]: value[] } — length-delimited fields are left as raw
// Uint8Array slices (callers decode strings/nested messages themselves).
function readProtobufFields(bytes, start = 0, end = bytes.length) {
  const fields = {}
  let i = start
  while (i < end) {
    const [tag, afterTag] = readVarint(bytes, i)
    const fieldNumber = tag >>> 3
    const wireType = tag & 0x7
    i = afterTag
    let value
    if (wireType === 0) {
      ;[value, i] = readVarint(bytes, i)
    } else if (wireType === 2) {
      let length
      ;[length, i] = readVarint(bytes, i)
      value = bytes.subarray(i, i + length)
      i += length
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType} in Anki package data`)
    }
    ;(fields[fieldNumber] ??= []).push(value)
  }
  return fields
}

const utf8Decoder = new TextDecoder()

/**
 * Decodes an Anki media manifest to a `{ [numericEntryName]: realFilename }`
 * map. Modern Anki: Zstandard-compressed, protobuf-encoded repeated
 * `MediaEntry { 1: name, 2: size, 3: sha1 }`, position in the list = the
 * zip's numeric entry name. Older Anki: plain JSON object already in that
 * `{ "0": "name", ... }` shape.
 */
export function decodeMediaManifest(rawBytes) {
  const bytes = looksZstdCompressed(rawBytes) ? zstdDecompress(rawBytes) : rawBytes
  try {
    const text = utf8Decoder.decode(bytes)
    if (text.trimStart().startsWith('{')) return JSON.parse(text)
  } catch {
    // Not valid JSON text — fall through to the protobuf format below.
  }

  const top = readProtobufFields(bytes)
  const entries = top[1] ?? [] // field 1: repeated MediaEntry, each itself length-delimited
  const manifest = {}
  entries.forEach((entryBytes, index) => {
    const entryFields = readProtobufFields(entryBytes)
    const name = utf8Decoder.decode(entryFields[1]?.[0] ?? new Uint8Array())
    manifest[String(index)] = name
  })
  return manifest
}

/** Decodes a `templates.config` blob to `{ qfmt, afmt }` (protobuf fields 1/2 — verified against a real deck during planning). */
export function decodeTemplateConfig(blob) {
  const fields = readProtobufFields(blob)
  return {
    qfmt: utf8Decoder.decode(fields[1]?.[0] ?? new Uint8Array()),
    afmt: utf8Decoder.decode(fields[2]?.[0] ?? new Uint8Array()),
  }
}

// --- Best-effort Anki template rendering (FR-013) ---
// Anki's real template language (conditionals, filters like `furigana:`,
// cloze numbering, etc.) is deliberately not fully reproduced — per
// spec.md's Assumptions, full parity is out of scope. `{{Field}}` and
// `{{#Field}}...{{/Field}}` / `{{^Field}}...{{/Field}}` conditionals cover
// the overwhelming majority of real templates (including this feature's
// verified sample deck); any other `{{modifier:Field}}` falls back to the
// plain field value, and `{{FrontSide}}` substitutes the already-rendered
// front so the answer side can build on it, matching Anki's own semantics.

function renderConditionals(template, fields) {
  return template.replace(/\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_match, kind, fieldName, inner) => {
    const isPresent = Boolean(fields.get(fieldName.trim()))
    const keep = kind === '#' ? isPresent : !isPresent
    return keep ? renderConditionals(inner, fields) : ''
  })
}

export function renderAnkiTemplate(template, fields) {
  const withConditionals = renderConditionals(template, fields)
  return withConditionals.replace(/\{\{([^#^/}]+)\}\}/g, (_match, rawName) => {
    const name = rawName.includes(':') ? rawName.split(':').pop().trim() : rawName.trim()
    return fields.get(name) ?? ''
  })
}

function splitClozeAnswer(text) {
  // {{c1::answer::hint}} -> "answer" (both index and optional hint dropped —
  // this is a passive review card, not an interactive cloze blank).
  return text.replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1')
}

function renderCard(qfmt, afmt, fields) {
  const isCloze = qfmt.includes('{{cloze:')
  const fieldsForRender = isCloze
    ? new Map([...fields].map(([name, value]) => [name, splitClozeAnswer(value)]))
    : fields
  const front = renderAnkiTemplate(qfmt, fieldsForRender)
  const back = renderAnkiTemplate(afmt, new Map([...fieldsForRender, ['FrontSide', front]]))
  return { front, back }
}

const MEDIA_REF_PATTERN = /\[sound:([^\]]+)\]|src=["']([^"']+)["']/g

function extractMediaFilenames(html) {
  const filenames = new Set()
  for (const match of html.matchAll(MEDIA_REF_PATTERN)) filenames.add(match[1] ?? match[2])
  return filenames
}

function pickCollectionEntryName(zip) {
  for (const name of ['collection.anki21b', 'collection.anki21', 'collection.anki2']) {
    if (zip.file(name)) return name
  }
  throw new Error('Not a valid Anki export: no collection.anki2/anki21/anki21b found in the archive')
}

// Anki's own client registers a custom "unicase" collation (used by the
// `fields`/`templates`/`notetypes` tables' `name` columns and their unique
// indexes) at the native SQLite C API level — sql.js's WASM build has no
// mechanism to register custom collations, and SQLite resolves every
// declared collation for the whole schema on first use of a connection, so
// without this, opening a real modern Anki collection fails outright with
// "no such collation sequence: unicase" before any query even runs. Neither
// this app nor Anki itself needs unicase (case-insensitive Unicode)
// comparison semantics for these names — the schema text is patched here to
// drop the clause, then re-exported, rather than trying to reimplement it.
function stripUnsupportedCollations(SQL, sqliteBytes) {
  const db = new SQL.Database(sqliteBytes)
  try {
    db.run('PRAGMA writable_schema = ON')
    db.run("UPDATE sqlite_master SET sql = REPLACE(sql, 'COLLATE unicase', '') WHERE sql LIKE '%COLLATE unicase%'")
    db.run('PRAGMA writable_schema = OFF')
    return db.export()
  } finally {
    db.close()
  }
}

/**
 * Parses a `.apkg` file's bytes into `{ decks, media }`:
 *   decks: [{ ankiDeckId, name, cards: [{ ankiNoteId, front, back, media: [{filename, sizeBytes}] }] }]
 *   media: Map<filename, Uint8Array> — only filenames actually referenced by an extracted card
 */
export async function parseAnkiPackage(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)

  const collectionEntryName = pickCollectionEntryName(zip)
  const rawCollectionBytes = await zip.file(collectionEntryName).async('uint8array')
  const sqliteBytes = await maybeDecompress(rawCollectionBytes)

  const mediaManifestFile = zip.file('media')
  const manifest = mediaManifestFile ? decodeMediaManifest(await mediaManifestFile.async('uint8array')) : {}
  const entryNameByFilename = new Map(Object.entries(manifest).map(([entry, filename]) => [filename, entry]))

  const SQL = await loadSqlJs()
  const db = new SQL.Database(stripUnsupportedCollations(SQL, sqliteBytes))
  try {
    return await extractDecks(db, zip, entryNameByFilename)
  } finally {
    db.close()
  }
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    return rows
  } finally {
    stmt.free()
  }
}

function loadNoteType(db, notetypeId, cache) {
  if (cache.has(notetypeId)) return cache.get(notetypeId)

  const fieldNames = queryAll(db, 'SELECT ord, name FROM fields WHERE ntid = ? ORDER BY ord', [notetypeId]).map(
    (row) => row.name
  )
  const templates = queryAll(db, 'SELECT ord, config FROM templates WHERE ntid = ? ORDER BY ord', [notetypeId]).map(
    (row) => ({ ord: row.ord, ...decodeTemplateConfig(row.config) })
  )
  const notetype = { fieldNames, templates }
  cache.set(notetypeId, notetype)
  return notetype
}

async function collectMedia(zip, entryNameByFilename, filenames, mediaOut) {
  const results = []
  for (const filename of filenames) {
    if (!mediaOut.has(filename)) {
      const entryName = entryNameByFilename.get(filename)
      const entry = entryName !== undefined ? zip.file(entryName) : null
      if (entry) mediaOut.set(filename, await entry.async('uint8array'))
    }
    const bytes = mediaOut.get(filename)
    if (bytes) results.push({ filename, sizeBytes: bytes.length })
  }
  return results
}

async function extractDecks(db, zip, entryNameByFilename) {
  const deckRows = queryAll(
    db,
    `SELECT DISTINCT d.id, d.name FROM decks d JOIN cards c ON c.did = d.id WHERE d.id != ?`,
    [DEFAULT_DECK_ID]
  )
  // The Default deck only counts if the exporter actually left cards in it.
  const defaultHasCards = queryAll(db, 'SELECT 1 FROM cards WHERE did = ? LIMIT 1', [DEFAULT_DECK_ID]).length > 0
  if (defaultHasCards) {
    const defaultRow = queryAll(db, 'SELECT id, name FROM decks WHERE id = ?', [DEFAULT_DECK_ID])[0]
    if (defaultRow) deckRows.push(defaultRow)
  }

  const notetypeCache = new Map()
  const media = new Map()
  const decks = []

  for (const deckRow of deckRows) {
    const cardRows = queryAll(
      db,
      `SELECT c.id AS cardId, c.ord AS cardOrd, n.id AS noteId, n.mid AS notetypeId, n.flds AS flds
       FROM cards c JOIN notes n ON n.id = c.nid
       WHERE c.did = ?`,
      [deckRow.id]
    )

    const cards = []
    for (const row of cardRows) {
      const notetype = loadNoteType(db, row.notetypeId, notetypeCache)
      const values = row.flds.split(FIELD_SEPARATOR)
      const fields = new Map(notetype.fieldNames.map((name, i) => [name, values[i] ?? '']))
      const template = notetype.templates.find((t) => t.ord === row.cardOrd) ?? notetype.templates[0]
      if (!template) continue // note type with no templates at all — nothing to render

      const { front, back } = renderCard(template.qfmt, template.afmt, fields)
      const referencedFilenames = new Set([...extractMediaFilenames(front), ...extractMediaFilenames(back)])
      const cardMedia = await collectMedia(zip, entryNameByFilename, referencedFilenames, media)

      cards.push({ ankiNoteId: row.noteId, front, back, media: cardMedia })
    }

    if (cards.length > 0) decks.push({ ankiDeckId: deckRow.id, name: deckRow.name, cards })
  }

  return { decks, media }
}
