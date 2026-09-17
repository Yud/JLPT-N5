import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { decodeMediaManifest, decodeTemplateConfig, parseAnkiPackage, renderAnkiTemplate } from './ankiImport.js'

// Node-side sql.js init for building fixtures, independent of ankiImport.js's
// own browser-facing loader — see that file's loadSqlJs()/loadWasmBinary()
// for why Vite/Vitest can't be trusted with sql.js's default wasm-locating
// logic (it resolves a path only a real browser can fetch).
// Memoized (one WASM module instance shared by every test in this file,
// each still getting its own fresh `new SQL.Database()`) — instantiating a
// separate Emscripten module per test accumulates enough WASM linear memory
// across a run to actually exhaust it.
let sqlJsForFixturesPromise
function initSqlJsForFixtures() {
  sqlJsForFixturesPromise ??= (async () => {
    // path.join(process.cwd(), ...), not `new URL(..., import.meta.url)`:
    // under Vitest's jsdom environment, our own source/test files'
    // import.meta.url is simulated as an http://localhost URL (matching
    // real browser semantics), not a real file:// path — only node_modules
    // dependencies get one.
    const wasmBinary = await readFile(path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'))
    return initSqlJs({
      instantiateWasm(imports, successCallback) {
        WebAssembly.instantiate(wasmBinary, imports).then(({ instance }) => successCallback(instance))
        return {}
      },
    })
  })()
  return sqlJsForFixturesPromise
}

// --- Tiny protobuf *writer*, independent of ankiImport.js's reader, used only
// to build realistic fixtures (Anki's own encoder is obviously not available
// here) — see research.md §1 for the schemas being reproduced.
function writeVarint(value) {
  const bytes = []
  let v = value >>> 0
  do {
    let byte = v & 0x7f
    v >>>= 7
    if (v !== 0) byte |= 0x80
    bytes.push(byte)
  } while (v !== 0)
  return Uint8Array.from(bytes)
}

function writeLengthDelimitedField(fieldNumber, contentBytes) {
  const tag = writeVarint((fieldNumber << 3) | 2)
  const length = writeVarint(contentBytes.length)
  return Uint8Array.from([...tag, ...length, ...contentBytes])
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const utf8 = new TextEncoder()

function encodeMediaEntry(name) {
  return writeLengthDelimitedField(1, utf8.encode(name))
}

function encodeMediaManifestProtobuf(filenamesByIndex) {
  return concatBytes(filenamesByIndex.map((name) => writeLengthDelimitedField(1, encodeMediaEntry(name))))
}

function encodeTemplateConfig(qfmt, afmt) {
  return concatBytes([writeLengthDelimitedField(1, utf8.encode(qfmt)), writeLengthDelimitedField(2, utf8.encode(afmt))])
}

// --- SQLite fixture builder — a real sql.js database with the same table
// shapes ankiImport.js queries (data-model.md / research.md §1), not a mock.
async function buildCollectionDb({ decks, notetype, notes }) {
  const SQL = await initSqlJsForFixtures()
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER);
    CREATE TABLE fields (ntid INTEGER, ord INTEGER, name TEXT);
    CREATE TABLE templates (ntid INTEGER, ord INTEGER, config BLOB);
  `)
  for (const deck of decks) db.run('INSERT INTO decks (id, name) VALUES (?, ?)', [deck.id, deck.name])
  notetype.fields.forEach((name, ord) => db.run('INSERT INTO fields (ntid, ord, name) VALUES (?, ?, ?)', [notetype.id, ord, name]))
  notetype.templates.forEach((tmpl, ord) =>
    db.run('INSERT INTO templates (ntid, ord, config) VALUES (?, ?, ?)', [
      notetype.id,
      ord,
      encodeTemplateConfig(tmpl.qfmt, tmpl.afmt),
    ])
  )
  for (const note of notes) {
    db.run('INSERT INTO notes (id, mid, flds) VALUES (?, ?, ?)', [note.id, notetype.id, note.fields.join('\x1f')])
    db.run('INSERT INTO cards (id, nid, did, ord) VALUES (?, ?, ?, ?)', [note.id * 10, note.id, note.deckId, note.cardOrd ?? 0])
  }
  const bytes = db.export()
  db.close()
  return bytes
}

async function buildApkgZip({ collectionEntryName, collectionBytes, mediaManifestBytes, mediaFiles }) {
  const zip = new JSZip()
  zip.file(collectionEntryName, collectionBytes)
  if (mediaManifestBytes) zip.file('media', mediaManifestBytes)
  for (const [entryName, bytes] of Object.entries(mediaFiles ?? {})) zip.file(entryName, bytes)
  return zip.generateAsync({ type: 'arraybuffer' })
}

const BASIC_NOTETYPE = {
  id: 1,
  fields: ['Front', 'Back'],
  templates: [{ qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }],
}

describe('renderAnkiTemplate', () => {
  it('substitutes plain fields', () => {
    const fields = new Map([['Front', '私']])
    expect(renderAnkiTemplate('{{Front}}', fields)).toBe('私')
  })

  it('keeps a #Field conditional section only when the field is non-empty', () => {
    const template = 'base{{#Pitch Accent}}<b>{{Pitch Accent}}</b>{{/Pitch Accent}}'
    expect(renderAnkiTemplate(template, new Map([['Pitch Accent', 'high']]))).toBe('base<b>high</b>')
    expect(renderAnkiTemplate(template, new Map([['Pitch Accent', '']]))).toBe('base')
  })

  it('keeps a ^Field conditional section only when the field is empty', () => {
    const template = '{{^Notes}}no notes{{/Notes}}'
    expect(renderAnkiTemplate(template, new Map([['Notes', '']]))).toBe('no notes')
    expect(renderAnkiTemplate(template, new Map([['Notes', 'something']]))).toBe('')
  })

  it('falls back to the plain field value for an unrecognized modifier (best-effort, FR-013)', () => {
    expect(renderAnkiTemplate('{{furigana:Word Furigana}}', new Map([['Word Furigana', '私[わたし]']]))).toBe('私[わたし]')
  })
})

describe('decodeMediaManifest', () => {
  it('reads the legacy plain-JSON manifest', () => {
    const bytes = utf8.encode(JSON.stringify({ 0: 'a.mp3', 1: 'b.jpg' }))
    expect(decodeMediaManifest(bytes)).toEqual({ 0: 'a.mp3', 1: 'b.jpg' })
  })

  it('reads the modern zstd-compressed protobuf manifest', () => {
    const protobuf = encodeMediaManifestProtobuf(['a.mp3', 'b.jpg'])
    const compressed = zstdCompressSync(protobuf)
    expect(decodeMediaManifest(compressed)).toEqual({ 0: 'a.mp3', 1: 'b.jpg' })
  })
})

describe('decodeTemplateConfig', () => {
  it('reads qfmt/afmt from a protobuf template config blob', () => {
    const blob = encodeTemplateConfig('{{Front}}', '{{Back}}')
    expect(decodeTemplateConfig(blob)).toEqual({ qfmt: '{{Front}}', afmt: '{{Back}}' })
  })
})

describe('parseAnkiPackage', () => {
  it('parses a legacy-format (plain SQLite, plain JSON media manifest) package', async () => {
    const collectionBytes = await buildCollectionDb({
      decks: [{ id: 2, name: 'My Deck' }],
      notetype: BASIC_NOTETYPE,
      notes: [{ id: 100, deckId: 2, fields: ['私', 'I'] }],
    })
    const buffer = await buildApkgZip({
      collectionEntryName: 'collection.anki2',
      collectionBytes,
      mediaManifestBytes: utf8.encode(JSON.stringify({})),
    })

    const { decks } = await parseAnkiPackage(buffer)
    expect(decks).toEqual([{ ankiDeckId: 2, name: 'My Deck', cards: [{ ankiNoteId: 100, front: '私', back: '私<hr>I', media: [] }] }])
  })

  it('parses a modern-format (zstd-compressed SQLite + protobuf media manifest) package, preferring it over a legacy stub', async () => {
    const realCollectionBytes = await buildCollectionDb({
      decks: [{ id: 2, name: 'Kaishi-like' }],
      notetype: BASIC_NOTETYPE,
      notes: [{ id: 100, deckId: 2, fields: ['私', 'I'] }],
    })
    const stubCollectionBytes = await buildCollectionDb({ decks: [], notetype: BASIC_NOTETYPE, notes: [] })

    const buffer = await buildApkgZip({
      collectionEntryName: 'collection.anki21b',
      collectionBytes: zstdCompressSync(realCollectionBytes),
      mediaManifestBytes: zstdCompressSync(encodeMediaManifestProtobuf([])),
      mediaFiles: {},
    })
    const zip = await JSZip.loadAsync(buffer)
    zip.file('collection.anki2', stubCollectionBytes) // legacy stub present too — must be ignored
    const finalBuffer = await zip.generateAsync({ type: 'arraybuffer' })

    const { decks } = await parseAnkiPackage(finalBuffer)
    expect(decks).toEqual([{ ankiDeckId: 2, name: 'Kaishi-like', cards: [{ ankiNoteId: 100, front: '私', back: '私<hr>I', media: [] }] }])
  })

  it('creates one deck per Anki sub-deck (FR-011)', async () => {
    const collectionBytes = await buildCollectionDb({
      decks: [
        { id: 2, name: 'Sub A' },
        { id: 3, name: 'Sub B' },
      ],
      notetype: BASIC_NOTETYPE,
      notes: [
        { id: 100, deckId: 2, fields: ['a', 'A'] },
        { id: 101, deckId: 3, fields: ['b', 'B'] },
      ],
    })
    const buffer = await buildApkgZip({ collectionEntryName: 'collection.anki2', collectionBytes })

    const { decks } = await parseAnkiPackage(buffer)
    expect(decks.map((d) => d.name).sort()).toEqual(['Sub A', 'Sub B'])
  })

  it('extracts referenced media bytes and lists them on the owning card, ignoring unreferenced media', async () => {
    const notetype = { id: 1, fields: ['Front', 'Back'], templates: [{ qfmt: '{{Front}}', afmt: '[sound:{{Back}}]' }] }
    const collectionBytes = await buildCollectionDb({
      decks: [{ id: 2, name: 'Audio Deck' }],
      notetype,
      notes: [{ id: 100, deckId: 2, fields: ['Q', 'answer.mp3'] }],
    })
    const audioBytes = new Uint8Array([1, 2, 3, 4])
    const buffer = await buildApkgZip({
      collectionEntryName: 'collection.anki2',
      collectionBytes,
      mediaManifestBytes: utf8.encode(JSON.stringify({ 0: 'answer.mp3', 1: 'unused.jpg' })),
      mediaFiles: { 0: audioBytes, 1: new Uint8Array([9, 9]) },
    })

    const { decks, media } = await parseAnkiPackage(buffer)
    expect(decks[0].cards[0].media).toEqual([{ filename: 'answer.mp3', sizeBytes: 4 }])
    expect(media.size).toBe(1)
    expect(media.get('answer.mp3')).toEqual(audioBytes)
  })

  it('best-effort renders a cloze note by revealing the answer rather than skipping the card (FR-013)', async () => {
    const clozeNotetype = {
      id: 5,
      fields: ['Text', 'Back Extra'],
      templates: [{ qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
    }
    const collectionBytes = await buildCollectionDb({
      decks: [{ id: 2, name: 'Cloze Deck' }],
      notetype: clozeNotetype,
      notes: [{ id: 100, deckId: 2, fields: ['The capital is {{c1::Paris}}.', 'a hint'] }],
    })
    const buffer = await buildApkgZip({ collectionEntryName: 'collection.anki2', collectionBytes })

    const { decks } = await parseAnkiPackage(buffer)
    expect(decks[0].cards[0].front).toBe('The capital is Paris.')
    expect(decks[0].cards[0].back).toBe('The capital is Paris.<br>a hint')
  })

  it('rejects a file with no recognizable Anki collection database', async () => {
    const zip = new JSZip()
    zip.file('not-anki.txt', 'hello')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    await expect(parseAnkiPackage(buffer)).rejects.toThrow(/not a valid anki export/i)
  })
})
