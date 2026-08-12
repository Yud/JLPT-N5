import { ref, computed } from 'vue'
import { getCharactersForGroup } from '../data/kana.js'

// Standard Fisher–Yates shuffle (unbiased, unlike `sort(() => Math.random() - 0.5)`).
function shuffle(items) {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Drives a single flashcard practice session for a given scope
 * (a row id, a table id, or "all") — see contracts/composables.contract.md.
 */
export function useFlashcardSession(scopeId) {
  const order = ref([])
  const index = ref(0)
  const revealed = ref(false)

  function restart() {
    order.value = shuffle(getCharactersForGroup(scopeId))
    index.value = 0
    revealed.value = false
  }

  restart()

  const complete = computed(() => order.value.length > 0 && index.value >= order.value.length)
  const currentCharacter = computed(() => (complete.value ? null : order.value[index.value] ?? null))
  const progress = computed(() => ({
    index: Math.min(index.value, order.value.length),
    total: order.value.length,
  }))

  function reveal() {
    revealed.value = true
  }

  function next() {
    if (complete.value) return
    index.value += 1
    revealed.value = false
  }

  return { currentCharacter, revealed, complete, progress, reveal, next, restart }
}
