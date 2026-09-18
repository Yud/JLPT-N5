// Parses an Anki .apkg export — used only server-side now, inside the
// DeckImportWorkflow (workflows/anki-import), never in the browser (see
// specs/003-anki-deck-import for the original design, workflows/anki-import's
// header comment for why this moved server-side: proxying/parsing a large
// deck client-driven kept hitting Cloudflare's per-request resource limits).
//
// A .apkg is a zip containing:
//   - collection.anki21b (current Anki) or collection.anki21/.anki2 (older) —
//     the real card database, either plain SQLite or Zstandard-compressed SQLite.
//   - a `media` manifest mapping the zip's numbered entries ("0", "1", ...) back
//     to real filenames — either a plain JSON object (older Anki) or a
//     Zstandard-compressed, protobuf-encoded list of {name, size, sha1} (current
//     Anki). Verified against a real ~100MB sample deck during planning.
//
// Zip reading uses fflate's unzipSync(), not JSZip: profiled against the real
// 108MB / 4,354-media-file sample deck that broke production
// (Kaishi.1.5k.v2.4.3.apkg, repo root), JSZip.loadAsync's full-archive index
// build alone took ~440ms — by far the single biggest cost in the whole parse
// phase, and enough on its own to blow the Workflow's CPU budget outside a
// step (see workflows/anki-import/src/index.js's header comment). fflate's
// unzipSync(bytes, { filter }) never builds an index of entries we don't ask
// for — it scans the central directory and only decompresses entries the
// filter callback accepts, which measured at single-digit milliseconds per
// call regardless of how many of the archive's ~4,358 entries were requested.
// Because of that, this module never indexes "all zip entries" up front at
// all: `entryNameByFilename` (real filename -> zip's numbered entry name)
// comes entirely from decoding the small `media` manifest file, and specific
// entries (the collection DB, or a chunk of media files) are looked up by
// name on demand via `extractZipEntries`.
//
// Split into a metadata phase and a render phase, not one combined parse,
// for two independent reasons:
//   1. Eagerly decompressing every referenced media file (a real deck's media
//      can total ~100MB decompressed) into one in-memory structure risks
//      Workers' 128MB-per-isolate memory cap — `decompressMediaFiles`
//      decompresses only the caller's requested filenames, called by the
//      Workflow immediately before each chunk's R2 writes and discarded right
//      after — never more than one chunk's worth in memory at a time.
//   2. Rendering ~1,500 cards' Anki templates is real CPU work (regex
//      substitution per card, including a recursive pass for `{{#Field}}`
//      conditionals) — profiling showed it's cheap per card (~0.03ms) but
//      adds up past what a single Workflow step's CPU budget allows for a
//      large deck, so it has to be chunkable across multiple step.do() calls
//      the same way media processing already is. `extractDeckMetadata`
//      returns raw, unrendered `cardRows` plus a `notetypeCache`; the
//      Workflow calls the separate, pure `renderCardChunk` on slices of that.
import { unzipSync } from 'fflate'
import { decompress as zstdDecompress } from 'fzstd'
import initSqlJs from 'sql.js'

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const FIELD_SEPARATOR = '\x1f'
const DEFAULT_DECK_ID = 1 // Anki's built-in "Default" deck — imported only if it actually holds cards
const COLLECTION_ENTRY_NAMES = ['collection.anki21b', 'collection.anki21', 'collection.anki2']

// sql.js's WASM loading is environment-specific (Node for tests, a static
// bundled import for the Workflow — see workflows/anki-import/src/loadSqlJs.js
// for that path, which WebAssembly.instantiate()-from-fetched-bytes can't use:
// Workers/Workflows disallow dynamic wasm compilation the same way they
// disallow eval). This is the Node-only path, used by ankiImport.test.js.
async function loadWasmBinaryForNode() {
  const [{ readFile }, { default: path }] = await Promise.all([import('node:fs/promises'), import('node:path')])
  return readFile(path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))
}

let sqlJsPromise
export function loadSqlJs() {
  sqlJsPromise ??= loadWasmBinaryForNode().then((wasmBytes) =>
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

// --- Zip-layer reads (fflate) — see module header comment for why this is
// never a full-archive index build, only ever a lookup of specific names. ---

/** Decompresses just `names` from the zip (never the whole archive) — returns `{ [name]: Uint8Array }`, missing any name not actually present. */
function extractZipEntries(rawBytes, names) {
  const wanted = new Set(names)
  return unzipSync(rawBytes, { filter: (file) => wanted.has(file.name) })
}

function pickCollectionBytes(rawBytes) {
  const found = extractZipEntries(rawBytes, COLLECTION_ENTRY_NAMES)
  for (const name of COLLECTION_ENTRY_NAMES) {
    if (found[name]) return found[name]
  }
  throw new Error('Not a valid Anki export: no collection.anki2/anki21/anki21b found in the archive')
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

/**
 * Decompresses one or more media files, given their real filenames, from the
 * raw .apkg bytes — in a single pass over the archive regardless of how many
 * filenames are requested (see module header comment: fflate's per-call cost
 * is dominated by a fixed central-directory scan, not by how many entries
 * match, so batching a whole chunk into one call is far cheaper than one call
 * per file). Returns `Map<filename, Uint8Array | null>` — null for any
 * filename the archive doesn't actually contain (e.g. referenced by a card
 * but missing from the export).
 *
 * Modern Anki packages zstd-compress every individual media entry, not just
 * the collection database (verified against a real ~100MB sample deck: all
 * 4,354 media files were compressed) — without the `maybeDecompress` below,
 * an extracted file would silently still be compressed bytes served under
 * its real content type, which looks fine by size/hash but never actually
 * renders or plays.
 */
export async function decompressMediaFiles(rawBytes, entryNameByFilename, filenames) {
  const entryNames = filenames.map((filename) => entryNameByFilename.get(filename)).filter((name) => name !== undefined)
  const extracted = extractZipEntries(rawBytes, entryNames)

  const result = new Map()
  for (const filename of filenames) {
    const entryName = entryNameByFilename.get(filename)
    const zipLayerBytes = entryName !== undefined ? extracted[entryName] : undefined
    result.set(filename, zipLayerBytes ? await maybeDecompress(zipLayerBytes) : null)
  }
  return result
}

/** Single-file convenience wrapper around `decompressMediaFiles` — see there for behavior. */
export async function decompressMediaFile(rawBytes, entryNameByFilename, filename) {
  const result = await decompressMediaFiles(rawBytes, entryNameByFilename, [filename])
  return result.get(filename)
}

/**
 * Parses a `.apkg` file's bytes into deck metadata and RAW (unrendered) card
 * rows — WITHOUT decompressing any media, and WITHOUT rendering card
 * templates (see module header comment for why both are deferred). `SQL` is
 * an already-initialized sql.js module (Node path: `loadSqlJs()` above;
 * Workflow path: workflows/anki-import/src/loadSqlJs.js's static-wasm-import
 * version).
 *
 * Deliberately does NOT return the archive's raw bytes, even though the
 * caller will need them again later for `decompressMediaFiles` — a real
 * archive can be 100MB+, and Workers caps a whole isolate at 128MB of memory
 * (fixed, same on every plan, unlike the CPU-time limit — see the Workflow's
 * header comment). Handing the caller a reference it would hold onto for an
 * entire multi-step Workflow run risks that cap on its own, regardless of
 * how carefully CPU time and D1 usage are chunked. Callers should re-fetch
 * the archive fresh, scoped to wherever they actually need its bytes (e.g.
 * inside each step.do() callback, not in the Workflow's own outer scope), so
 * it's eligible for GC again as soon as that scope is done with it.
 *
 * Returns `{ decks, entryNameByFilename, notetypeCache }`:
 *   decks: [{ ankiDeckId, name, cardRows: [{ cardId, cardOrd, noteId, notetypeId, flds }] }]
 *   entryNameByFilename: real filename -> the zip's numbered entry name, for
 *     later `decompressMediaFiles` calls (which take the archive's bytes
 *     freshly, as their own argument, precisely so this function doesn't
 *     have to hand them back).
 *   notetypeCache: every notetype (fields + templates) referenced by any
 *     returned card, pre-loaded while the SQLite connection was still open —
 *     callers pass this straight to `renderCardChunk`, which needs it to
 *     render but never touches SQLite itself.
 */
export async function extractDeckMetadata(arrayBuffer, SQL) {
  const rawBytes = new Uint8Array(arrayBuffer)

  const rawCollectionBytes = pickCollectionBytes(rawBytes)
  const sqliteBytes = await maybeDecompress(rawCollectionBytes)

  const mediaManifestBytes = extractZipEntries(rawBytes, ['media'])['media']
  const manifest = mediaManifestBytes ? decodeMediaManifest(mediaManifestBytes) : {}
  const entryNameByFilename = new Map(Object.entries(manifest).map(([entry, filename]) => [filename, entry]))

  const db = new SQL.Database(stripUnsupportedCollations(SQL, sqliteBytes))
  let decks, notetypeCache
  try {
    ;({ decks, notetypeCache } = extractDeckCardRows(db))
  } finally {
    db.close() // no more D1/SQLite queries needed once card rows + the notetype cache are extracted — rendering below is pure, and media decompression only needs entryNameByFilename plus a fresh copy of the archive's bytes
  }

  return { decks, entryNameByFilename, notetypeCache }
}

function extractDeckCardRows(db) {
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
  const decks = []

  for (const deckRow of deckRows) {
    const cardRows = queryAll(
      db,
      `SELECT c.id AS cardId, c.ord AS cardOrd, n.id AS noteId, n.mid AS notetypeId, n.flds AS flds
       FROM cards c JOIN notes n ON n.id = c.nid
       WHERE c.did = ?`,
      [deckRow.id]
    )
    // Pre-loads (and memoizes) every notetype these rows reference while `db`
    // is still open — renderCardChunk needs fieldNames/templates but never
    // touches SQLite, since by the time it runs the connection is closed.
    for (const row of cardRows) loadNoteType(db, row.notetypeId, notetypeCache)

    if (cardRows.length > 0) decks.push({ ankiDeckId: deckRow.id, name: deckRow.name, cardRows })
  }

  return { decks, notetypeCache }
}

/**
 * Renders a slice of raw card rows (from `extractDeckMetadata`'s
 * `decks[].cardRows`) into `{ ankiNoteId, front, back, mediaFilenames }[]` —
 * pure and side-effect-free, given the `notetypeCache` `extractDeckMetadata`
 * already built. This is the piece the Workflow chunks across multiple
 * step.do() calls (see workflows/anki-import/src/index.js) — profiling
 * showed it's cheap per card, but rendering all of a large deck's ~1,500
 * cards in one shot still adds up past a single step's CPU budget.
 */
export function renderCardChunk(cardRows, notetypeCache) {
  const rendered = []
  for (const row of cardRows) {
    const notetype = notetypeCache.get(row.notetypeId)
    const values = row.flds.split(FIELD_SEPARATOR)
    const fields = new Map(notetype.fieldNames.map((name, i) => [name, values[i] ?? '']))
    const template = notetype.templates.find((t) => t.ord === row.cardOrd) ?? notetype.templates[0]
    if (!template) continue // note type with no templates at all — nothing to render

    const { front, back } = renderCard(template.qfmt, template.afmt, fields)
    const mediaFilenames = [...new Set([...extractMediaFilenames(front), ...extractMediaFilenames(back)])]

    rendered.push({ ankiNoteId: row.noteId, front, back, mediaFilenames })
  }
  return rendered
}
