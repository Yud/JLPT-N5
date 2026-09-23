// Minimal, hand-rolled ZIP reader built entirely on random-access range
// reads (a `Reader`: `{ getLength(): Promise<number>, read(offset, length):
// Promise<Uint8Array> }` — workflows/anki-import/src/r2ZipReader.js
// implements this against R2; `ArrayBufferZipReader` below implements it
// in-memory, for Node/tests) — never reads more of a ZIP than the specific
// bytes asked for. See ANKI-IMPORT-RANGE-READ-PLAN.md (repo root) for the
// full history of why: every earlier design fetched the whole ~108MB .apkg
// archive into memory somewhere, and that kept resurfacing as a production
// failure (CPU time, isolate memory, or both) no matter how carefully the
// *rest* of the pipeline chunked its own work around that one fetch.
//
// `unzipit` (npm) was evaluated first — it also range-reads and does run
// correctly in workerd (DecompressionStream('deflate-raw') included), but
// its own central-directory parser cost 21.2ms against this project's real
// fixture (Kaishi.1.5k.v2.4.3.apkg, repo root; 4,358 entries) — over the
// 10ms/step CPU budget (Workers Free) on its own, before any per-file work.
// That cost comes from building a full `ZipEntry` object per entry (lazy
// Date parsing, comment decoding, an extra-fields array, Info-ZIP-Unicode
// and zip64 checks) regardless of whether any of that is ever used. This
// module parses only the 5 fields the redesign actually needs per entry —
// measured at 3.08ms (cold) for the same 4,358 entries, comfortably under
// budget. Zip64 (>4GB archives or >65,535 entries) is deliberately
// unsupported — Anki exports are nowhere near that scale, and this throws a
// clear error rather than silently misparsing if that assumption ever
// breaks.

const EOCDR_SIGNATURE = 0x06054b50
const EOCDR_WITHOUT_COMMENT_SIZE = 22
const MAX_COMMENT_SIZE = 0xffff // 2-byte length field
const CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50
const CENTRAL_DIRECTORY_FILE_HEADER_SIZE = 46
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const LOCAL_FILE_HEADER_SIZE = 30

const utf8Decoder = new TextDecoder()

function getUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function getUint32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

/** In-memory `Reader` over an already-loaded ArrayBuffer/Uint8Array — for Node tests and any other case that already has the bytes. */
export class ArrayBufferZipReader {
  #bytes
  constructor(bytesOrArrayBuffer) {
    this.#bytes = bytesOrArrayBuffer instanceof Uint8Array ? bytesOrArrayBuffer : new Uint8Array(bytesOrArrayBuffer)
  }
  async getLength() {
    return this.#bytes.length
  }
  async read(offset, length) {
    return this.#bytes.slice(offset, offset + length)
  }
}

/** Finds the End-Of-Central-Directory record — always in the last 22-65,557 bytes (a fixed record + an optional comment, max 64KB) — with one range read. */
async function locateEndOfCentralDirectory(reader) {
  const totalLength = await reader.getLength()
  const tailLength = Math.min(EOCDR_WITHOUT_COMMENT_SIZE + MAX_COMMENT_SIZE, totalLength)
  const tail = await reader.read(totalLength - tailLength, tailLength)

  for (let i = tailLength - EOCDR_WITHOUT_COMMENT_SIZE; i >= 0; i--) {
    if (getUint32LE(tail, i) !== EOCDR_SIGNATURE) continue
    const entryCount = getUint16LE(tail, i + 10)
    const centralDirectorySize = getUint32LE(tail, i + 12)
    const centralDirectoryOffset = getUint32LE(tail, i + 16)
    if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
      throw new Error('ZIP64 archives are not supported by this reader')
    }
    return { entryCount, centralDirectorySize, centralDirectoryOffset }
  }
  throw new Error('End of central directory record not found — not a valid zip file')
}

/**
 * Reads and parses the whole central directory in one more range read —
 * a few hundred KB for a real Anki deck, not the archive itself — returning
 * `{ name, compressionMethod, compressedSize, uncompressedSize,
 * relativeOffsetOfLocalHeader }[]`. See module header comment for why this
 * doesn't build full `ZipEntry`-style objects.
 */
export async function readCentralDirectory(reader) {
  const { entryCount, centralDirectorySize, centralDirectoryOffset } = await locateEndOfCentralDirectory(reader)
  const buffer = await reader.read(centralDirectoryOffset, centralDirectorySize)

  const entries = new Array(entryCount)
  let cursor = 0
  for (let i = 0; i < entryCount; i++) {
    if (getUint32LE(buffer, cursor) !== CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
      throw new Error(`invalid central directory file header signature at entry ${i}`)
    }
    const compressionMethod = getUint16LE(buffer, cursor + 10)
    const compressedSize = getUint32LE(buffer, cursor + 20)
    const uncompressedSize = getUint32LE(buffer, cursor + 24)
    const fileNameLength = getUint16LE(buffer, cursor + 28)
    const extraFieldLength = getUint16LE(buffer, cursor + 30)
    const fileCommentLength = getUint16LE(buffer, cursor + 32)
    const relativeOffsetOfLocalHeader = getUint32LE(buffer, cursor + 42)
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || relativeOffsetOfLocalHeader === 0xffffffff) {
      throw new Error(`central directory entry ${i} needs zip64 extensions — not supported by this reader`)
    }

    const nameStart = cursor + CENTRAL_DIRECTORY_FILE_HEADER_SIZE
    const name = utf8Decoder.decode(buffer.subarray(nameStart, nameStart + fileNameLength))
    entries[i] = { name, compressionMethod, compressedSize, uncompressedSize, relativeOffsetOfLocalHeader }
    cursor = nameStart + fileNameLength + extraFieldLength + fileCommentLength
  }
  return entries
}

async function inflateRawDeflate(compressedBytes, expectedUncompressedSize, entryName) {
  // A ReadableStream, not `new Blob([compressedBytes]).stream()` — jsdom
  // (this project's Node-side test environment) provides its own `Blob`
  // for DOM compatibility, and that implementation has no `.stream()`,
  // unlike the platform Blob this code runs against in workerd. Building
  // the stream directly works identically in both.
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressedBytes)
      controller.close()
    },
  }).pipeThrough(new DecompressionStream('deflate-raw'))
  const decompressed = new Uint8Array(await new Response(stream).arrayBuffer())
  if (decompressed.byteLength !== expectedUncompressedSize) {
    throw new Error(
      `decompressed size mismatch for entry "${entryName}": expected ${expectedUncompressedSize}, got ${decompressed.byteLength}`
    )
  }
  return decompressed
}

/**
 * Range-reads and decompresses one entry's data, given the record
 * `readCentralDirectory` returned for it — the local file header is read
 * first (30 bytes) because its filename/extra-field lengths, not the
 * central directory's, determine where the actual data starts. Never reads
 * more than this one entry's own header + compressed bytes.
 */
export async function readZipEntryData(reader, entry) {
  const localHeader = await reader.read(entry.relativeOffsetOfLocalHeader, LOCAL_FILE_HEADER_SIZE)
  if (getUint32LE(localHeader, 0) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`invalid local file header signature for entry "${entry.name}"`)
  }
  const fileNameLength = getUint16LE(localHeader, 26)
  const extraFieldLength = getUint16LE(localHeader, 28)
  const dataOffset = entry.relativeOffsetOfLocalHeader + LOCAL_FILE_HEADER_SIZE + fileNameLength + extraFieldLength
  const compressedBytes = await reader.read(dataOffset, entry.compressedSize)

  if (entry.compressionMethod === 0) return compressedBytes
  if (entry.compressionMethod === 8) return inflateRawDeflate(compressedBytes, entry.uncompressedSize, entry.name)
  throw new Error(`unsupported zip compression method ${entry.compressionMethod} for entry "${entry.name}" (only stored/deflate are supported)`)
}
