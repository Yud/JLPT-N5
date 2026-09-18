import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDeckImport } from './useDeckImport.js'

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) }
}

describe('useDeckImport', () => {
  it('uploads directly to the presigned URL (not this app\'s API), starts processing, and polls to done', async () => {
    const fetchMock = vi.fn(async (url, options) => {
      if (url === '/api/decks/import') return jsonResponse({ jobId: 'job-1', uploadUrl: 'https://r2.example/upload' })
      if (url === 'https://r2.example/upload') {
        expect(options.method).toBe('PUT')
        return { ok: true }
      }
      if (url === '/api/decks/import/job-1/start') return jsonResponse({})
      if (url === '/api/decks/import/job-1') return jsonResponse({ status: 'done', decksTotal: 2, decksDone: 2, mediaTotal: 5, mediaDone: 5 })
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const importer = useDeckImport()
    await importer.importFile(new File(['bytes'], 'deck.apkg'))

    expect(importer.status.value).toBe('done')
    expect(importer.message.value).toBe('Imported 2 decks.')
    expect(importer.progress.value).toMatchObject({ decksTotal: 2, decksDone: 2, mediaTotal: 5, mediaDone: 5 })

    // The file itself only ever went to the presigned URL, never to this app's own API.
    const uploadCall = fetchMock.mock.calls.find(([, options]) => options?.body instanceof File)
    expect(uploadCall[0]).toBe('https://r2.example/upload')
  })

  it('sets status to error when the direct upload to R2 fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === '/api/decks/import') return jsonResponse({ jobId: 'job-1', uploadUrl: 'https://r2.example/upload' })
        if (url === 'https://r2.example/upload') return { ok: false, status: 500 }
        throw new Error(`Unexpected fetch: ${url}`)
      })
    )

    const importer = useDeckImport()
    await importer.importFile(new File(['bytes'], 'deck.apkg'))

    expect(importer.status.value).toBe('error')
    expect(importer.message.value).toContain('Upload failed')
  })

  it('sets status to error when the job itself fails during processing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        if (url === '/api/decks/import') return jsonResponse({ jobId: 'job-1', uploadUrl: 'https://r2.example/upload' })
        if (url === 'https://r2.example/upload') return { ok: true }
        if (url === '/api/decks/import/job-1/start') return jsonResponse({})
        if (url === '/api/decks/import/job-1') return jsonResponse({ status: 'error', error: 'Not a valid Anki export' })
        throw new Error(`Unexpected fetch: ${url}`)
      })
    )

    const importer = useDeckImport()
    await importer.importFile(new File(['bytes'], 'deck.apkg'))

    expect(importer.status.value).toBe('error')
    expect(importer.message.value).toBe('Not a valid Anki export')
  })
})
