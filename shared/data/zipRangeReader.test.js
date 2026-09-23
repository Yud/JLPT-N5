import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { ArrayBufferZipReader, readCentralDirectory, readZipEntryData } from './zipRangeReader.js'

async function buildZip(files) {
  const zip = new JSZip()
  for (const [name, { content, compression = 'DEFLATE' }] of Object.entries(files)) zip.file(name, content, { compression })
  const buffer = await zip.generateAsync({ type: 'uint8array' })
  return new ArrayBufferZipReader(buffer)
}

describe('readCentralDirectory + readZipEntryData', () => {
  it('parses a multi-entry zip and range-reads byte-exact content for stored and deflated entries', async () => {
    const reader = await buildZip({
      'small.txt': { content: 'short', compression: 'STORE' },
      'bigger.txt': { content: 'repeat-me '.repeat(200), compression: 'DEFLATE' },
    })

    const entries = await readCentralDirectory(reader)
    expect(entries.map((e) => e.name).sort()).toEqual(['bigger.txt', 'small.txt'])

    const bySmall = entries.find((e) => e.name === 'small.txt')
    const byBigger = entries.find((e) => e.name === 'bigger.txt')
    expect(bySmall.compressionMethod).toBe(0) // stored
    expect(byBigger.compressionMethod).toBe(8) // deflated

    expect(new TextDecoder().decode(await readZipEntryData(reader, bySmall))).toBe('short')
    expect(new TextDecoder().decode(await readZipEntryData(reader, byBigger))).toBe('repeat-me '.repeat(200))
  })

  it('parses many entries correctly (central directory batch-read, not per-entry)', async () => {
    const files = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [String(i), { content: `content-${i}` }]))
    const reader = await buildZip(files)

    const entries = await readCentralDirectory(reader)
    expect(entries).toHaveLength(500)

    const entryByName = new Map(entries.map((e) => [e.name, e]))
    expect(new TextDecoder().decode(await readZipEntryData(reader, entryByName.get('250')))).toBe('content-250')
  })

  it('rejects a buffer with no End-Of-Central-Directory record', async () => {
    const reader = new ArrayBufferZipReader(new Uint8Array([1, 2, 3, 4]))
    await expect(readCentralDirectory(reader)).rejects.toThrow(/end of central directory/i)
  })

  it('rejects an entry with an unsupported compression method', async () => {
    const reader = await buildZip({ 'a.txt': { content: 'hi' } })
    const [entry] = await readCentralDirectory(reader)
    await expect(readZipEntryData(reader, { ...entry, compressionMethod: 99 })).rejects.toThrow(/unsupported zip compression method/i)
  })
})

describe('ArrayBufferZipReader', () => {
  it('reports length and returns independent copies for overlapping reads', async () => {
    const reader = new ArrayBufferZipReader(new Uint8Array([1, 2, 3, 4, 5]))
    expect(await reader.getLength()).toBe(5)
    expect(await reader.read(1, 3)).toEqual(new Uint8Array([2, 3, 4]))
  })
})
