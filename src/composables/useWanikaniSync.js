import { ref } from 'vue'

/**
 * Triggers a server-side refresh of the WaniKani word cache
 * (POST /api/wanikani-words/sync — see functions/api/wanikani-words/sync.js),
 * which re-fetches from your WaniKani account and replaces D1's cache. Runs
 * entirely server-side; the WaniKani API key never reaches the browser.
 */
export function useWanikaniSync() {
  const status = ref('idle') // 'idle' | 'syncing' | 'done' | 'error'
  const message = ref('')

  async function sync() {
    status.value = 'syncing'
    message.value = ''
    try {
      const res = await fetch('/api/wanikani-words/sync', { method: 'POST' })
      if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
      const data = await res.json()
      status.value = 'done'
      message.value = `Synced ${data.synced} word${data.synced === 1 ? '' : 's'}.`
    } catch (err) {
      status.value = 'error'
      message.value = err.message || 'Sync failed.'
    }
  }

  return { status, message, sync }
}
