import { ref, computed } from 'vue'

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
 * Drives a single flashcard practice session for a given scope. `getItems`
 * resolves a scope id (or array of scope ids) to the card list — e.g.
 * kana.js's getCharactersForGroup or words.js's getWordsForCategory — so
 * this engine is shared by every flashcard pillar (useFlashcardSession,
 * useVocabFlashcardSession) without duplicating shuffle/reveal/grade logic.
 * See contracts/composables.contract.md.
 */
export function useCardSession(scopeId, getItems) {
  const order = ref([])
  const index = ref(0)
  const revealed = ref(false)

  function restart() {
    order.value = shuffle(getItems(scopeId))
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

  // Records a review grade for the current card and advances immediately —
  // local progress isn't gated on the network request, so a slow or failed
  // request never blocks the session.
  function grade(value) {
    const card = currentCharacter.value
    if (!card) return
    next()
    fetch(`/api/reviews/${card.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade: value }),
    }).catch(() => {})
  }

  return { currentCharacter, revealed, complete, progress, reveal, next, grade, restart }
}
