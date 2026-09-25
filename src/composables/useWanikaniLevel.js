import { ref, toValue, watch } from 'vue'

/**
 * Loads one WaniKani level's subjects and their next review times, live
 * from WaniKani via GET /api/wanikani/level (see functions/api/wanikani/level.js).
 * `level` may be a ref/getter; null/undefined means "your current level".
 * Re-fetches whenever it changes.
 */
export function useWanikaniLevel(level) {
  const data = ref(null) // { level, userLevel, maxLevel, items }
  const status = ref('loading') // 'loading' | 'ready' | 'error'
  const error = ref('')

  // Guards against a slow response for a previously selected level landing
  // after (and overwriting) the one for the level now selected.
  let requestId = 0

  async function load() {
    const id = ++requestId
    const selected = toValue(level)
    status.value = 'loading'
    error.value = ''
    try {
      const res = await fetch(selected ? `/api/wanikani/level?level=${selected}` : '/api/wanikani/level')
      if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
      const body = await res.json()
      if (id !== requestId) return
      data.value = body
      status.value = 'ready'
    } catch (err) {
      if (id !== requestId) return
      error.value = err.message || 'Request failed.'
      status.value = 'error'
    }
  }

  watch(() => toValue(level), load, { immediate: true })

  return { data, status, error, reload: load }
}

// 'default' keeps WaniKani's own lesson order (as returned by the API).
// Both next-review orders put items with no upcoming review (locked, in the
// lesson queue, burned) last, since they have no time to compare.
export function sortItems(items, sort) {
  if (sort === 'default') return items
  const direction = sort === 'next-desc' ? -1 : 1
  return [...items].sort((a, b) => {
    if (!a.availableAt && !b.availableAt) return 0
    if (!a.availableAt) return 1
    if (!b.availableAt) return -1
    return direction * (Date.parse(a.availableAt) - Date.parse(b.availableAt))
  })
}
