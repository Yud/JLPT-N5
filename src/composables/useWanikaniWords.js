import { ref } from 'vue'

/**
 * Loads the WaniKani vocabulary cache from the backend (D1-backed, via
 * GET /api/wanikani-words — see functions/api/wanikani-words/index.js).
 * Nothing here is bundled at build time: the word list, meanings, and
 * audio URLs live only in the database, never in the repo. `reload` lets a
 * caller (the "Sync from WaniKani" button) refresh it after the cache
 * changes server-side.
 */
export function useWanikaniWords() {
  const words = ref([])
  const status = ref('loading') // 'loading' | 'ready' | 'error'

  async function load() {
    status.value = 'loading'
    try {
      const res = await fetch('/api/wanikani-words')
      if (!res.ok) throw new Error(`Request failed: ${res.status}`)
      const data = await res.json()
      words.value = data.words
      status.value = 'ready'
    } catch {
      status.value = 'error'
    }
  }

  load()

  return { words, status, reload: load }
}
