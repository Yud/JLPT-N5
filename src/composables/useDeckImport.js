import { ref } from 'vue'

const POLL_INTERVAL_MS = 1500

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`)
  return response.json()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Polls a deck_import_jobs row (functions/api/decks/import/[jobId].js) until
// the background DeckImportWorkflow (workflows/anki-import) finishes or
// fails. onProgress reports the raw job payload after each poll.
async function pollJob(jobId, onProgress) {
  for (;;) {
    const response = await fetch(`/api/decks/import/${jobId}`)
    if (!response.ok) throw new Error((await response.text()) || `Failed to check import status: ${response.status}`)
    const job = await response.json()
    onProgress(job)

    if (job.status === 'done') return job
    if (job.status === 'error') throw new Error(job.error || 'Import failed.')
    await sleep(POLL_INTERVAL_MS)
  }
}

/**
 * Drives importing an Anki .apkg file. The browser does exactly three things:
 * ask the backend for a presigned upload URL (POST /api/decks/import), PUT
 * the raw file straight to R2 with it, then tell the backend to start
 * processing (POST .../start) and poll for progress — everything else
 * (parsing the .apkg, decompressing media, writing decks/cards/media) runs
 * server-side in a Workflow. See specs/003-anki-deck-import and this
 * feature's redesign for why: parsing/uploading client-side used to
 * repeatedly crash production at real-world deck sizes.
 */
export function useDeckImport() {
  const status = ref('idle') // 'idle' | 'uploading' | 'processing' | 'done' | 'error'
  const message = ref('')
  const progress = ref({ decksDone: 0, decksTotal: 0, mediaDone: 0, mediaTotal: 0 })

  async function importFile(file) {
    status.value = 'uploading'
    message.value = ''
    progress.value = { decksDone: 0, decksTotal: 0, mediaDone: 0, mediaTotal: 0 }

    try {
      const { jobId, uploadUrl } = await postJson('/api/decks/import', {})

      const putResponse = await fetch(uploadUrl, { method: 'PUT', body: file }) // straight to R2, not this app's API
      if (!putResponse.ok) throw new Error(`Upload failed: ${putResponse.status}`)

      await postJson(`/api/decks/import/${jobId}/start`, {})
      status.value = 'processing'

      const finalJob = await pollJob(jobId, (job) => {
        progress.value = job
      })

      status.value = 'done'
      message.value = `Imported ${finalJob.decksTotal} deck${finalJob.decksTotal === 1 ? '' : 's'}.`
    } catch (err) {
      status.value = 'error'
      message.value = err.message || 'Import failed.'
    }
  }

  return { status, message, progress, importFile }
}
