// Verifies R2ZipReader (workflows/anki-import/src/r2ZipReader.js) against a
// REAL R2 binding under the real Workers runtime (env.MEDIA, via
// @cloudflare/vitest-pool-workers), driven through the actual production
// zip parser (src/data/zipRangeReader.js) — not a mock of either. This is
// the "does the Reader interface the parser expects actually work against
// R2's range-GET API" check from ANKI-IMPORT-RANGE-READ-PLAN.md step 2,
// kept as a standing regression test rather than a one-off script.
import { env } from 'cloudflare:workers'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { readCentralDirectory, readZipEntryData } from '../../src/data/zipRangeReader.js'
import { R2ZipReader } from '../../workflows/anki-import/src/r2ZipReader.js'

const KEY = 'test/r2-zip-reader-fixture.zip'

async function buildFixtureZip() {
  const zip = new JSZip()
  zip.file('small.txt', 'short') // small enough that JSZip stores it uncompressed
  zip.file('bigger.txt', 'repeat-me '.repeat(200)) // long/repetitive enough to actually deflate
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

beforeEach(async () => {
  await env.MEDIA.delete(KEY)
})

describe('R2ZipReader', () => {
  it('feeds the real production parser real range-read R2 GETs and yields byte-exact entries', async () => {
    const zipBytes = await buildFixtureZip()
    await env.MEDIA.put(KEY, zipBytes)

    const reader = new R2ZipReader(env.MEDIA, KEY)
    expect(await reader.getLength()).toBe(zipBytes.length)

    const entries = await readCentralDirectory(reader)
    expect(entries.map((entry) => entry.name).sort()).toEqual(['bigger.txt', 'small.txt'])

    const bodies = {}
    for (const entry of entries) bodies[entry.name] = new TextDecoder().decode(await readZipEntryData(reader, entry))
    expect(bodies['small.txt']).toBe('short')
    expect(bodies['bigger.txt']).toBe('repeat-me '.repeat(200))

    const biggerEntry = entries.find((entry) => entry.name === 'bigger.txt')
    expect(biggerEntry.compressionMethod).toBe(8) // actually deflated, not stored — proves DecompressionStream('deflate-raw') ran for real
  })

  it('rejects a missing key the same way for getLength and read', async () => {
    const reader = new R2ZipReader(env.MEDIA, 'test/does-not-exist.zip')
    await expect(reader.getLength()).rejects.toThrow('R2 object not found')
    await expect(reader.read(0, 10)).rejects.toThrow('R2 object not found')
  })
})
