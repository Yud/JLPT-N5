import { ref, toValue, watch } from 'vue'

/**
 * Loads every WaniKani item at one SRS stage, live from WaniKani via
 * GET /api/wanikani/srs-items (see functions/api/wanikani/srs-items.js).
 * That endpoint is paginated to keep each Worker invocation's WaniKani
 * requests bounded, so this follows its `nextAfter` cursor one call at a
 * time until the whole stage is loaded. `stage` may be a ref/getter;
 * null/undefined means nothing selected. Re-fetches whenever it changes.
 */
export function useWanikaniSrsItems(stage) {
  const items = ref([])
  const total = ref(0)
  const status = ref('idle') // 'idle' | 'loading' | 'ready' | 'error'
  const error = ref('')

  // Guards against a slow load for a previously selected stage landing
  // after (and overwriting) the one for the stage now selected.
  let requestId = 0

  async function load() {
    const id = ++requestId
    const selected = toValue(stage)
    items.value = []
    total.value = 0
    error.value = ''
    if (selected === null || selected === undefined) {
      status.value = 'idle'
      return
    }

    status.value = 'loading'
    try {
      let after = null
      do {
        const query = after === null ? `stage=${selected}` : `stage=${selected}&after=${after}`
        const res = await fetch(`/api/wanikani/srs-items?${query}`)
        if (!res.ok) throw new Error((await res.text()) || `Request failed: ${res.status}`)
        const body = await res.json()
        if (id !== requestId) return
        items.value = [...items.value, ...body.items]
        total.value = body.total
        after = body.nextAfter
      } while (after !== null)
      status.value = 'ready'
    } catch (err) {
      if (id !== requestId) return
      error.value = err.message || 'Request failed.'
      status.value = 'error'
    }
  }

  watch(() => toValue(stage), load, { immediate: true })

  return { items, total, status, error, reload: load }
}

// WaniKani's own lesson order within a level: radicals, kanji, vocabulary.
const TYPE_ORDER = { radical: 0, kanji: 1, vocabulary: 2, kana_vocabulary: 3 }

// 'default' is WaniKani order: by level, then type, then lesson position.
// Both next-review orders put items with no upcoming review (lesson queue,
// burned) last, since they have no time to compare.
export function sortItems(items, sort) {
  if (sort === 'default') {
    return [...items].sort(
      (a, b) => a.level - b.level || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.lessonPosition - b.lessonPosition,
    )
  }
  const direction = sort === 'next-desc' ? -1 : 1
  return [...items].sort((a, b) => {
    if (!a.availableAt && !b.availableAt) return 0
    if (!a.availableAt) return 1
    if (!b.availableAt) return -1
    return direction * (Date.parse(a.availableAt) - Date.parse(b.availableAt))
  })
}
